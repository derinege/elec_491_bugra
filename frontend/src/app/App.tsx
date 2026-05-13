import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Activity, Cable, Download, Mic2, Square, Upload, Usb } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input, Select } from '../components/Input';
import {
  PIPELINE_TOTAL_RECORD_SAMPLES,
  pipelinePhaseForSampleIndex,
} from './pipelineConstants';

/** ``Emgcontroldashboarddesign`` / ``config.py`` ile aynı jest listesi (REST hariç). */
const GESTURE_OPTIONS = [
  'HAND_OPEN',
  'HAND_CLOSE',
  'INDEX_OPEN',
  'INDEX_CLOSE',
  'INDEX_MID',
  'THUMB_OPEN',
  'THUMB_MID',
  'THUMB_CLOSE',
  'MIDDLE_OPEN',
  'MIDDLE_MID',
  'MIDDLE_CLOSE',
  'RING_OPEN',
  'RING_MID',
  'RING_CLOSE',
  'PINKY_OPEN',
  'PINKY_MID',
  'PINKY_CLOSE',
  'WRIST_FLEX',
  'WRIST_EXT',
  'HAND_OPEN_CLOSE',
] as const;

type Gesture = (typeof GESTURE_OPTIONS)[number];

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  open: (o: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};

type SampleRow = { raw: number; envelope: number | null };

type TakeRow = {
  id: string;
  gesture: Gesture;
  durationSec: number;
  samples: SampleRow[];
  createdAt: string;
};

const SERIAL_BAUD = 115200;
/** Bağlantı testi: bu süre içinde en az bir geçerli satır beklenir. */
const CONNECTION_TEST_MS = 3000;

function parseEmgDataLine(line: string): SampleRow | null {
  const s = line.trim();
  if (!s || s.startsWith('#') || s.toLowerCase().startsWith('raw')) return null;
  const sp = s.split(',');
  const raw = Number.parseInt(sp[0] ?? '', 10);
  if (!Number.isFinite(raw)) return null;
  const env = sp.length >= 2 ? Number.parseInt(sp[1], 10) : NaN;
  return { raw, envelope: Number.isFinite(env) ? env : null };
}

function webSerialOk(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

/** ``emg_record_core.save_waveform_csv_atomic`` ile aynı — ``preprocessor.py`` / ``extract_features.py`` girdisi. */
function buildPipelineRawCsv(samples: SampleRow[]): string {
  const lines = ['sample_index,raw_adc,phase'];
  samples.forEach((s, i) => {
    lines.push(`${i},${s.raw},${pipelinePhaseForSampleIndex(i)}`);
  });
  return lines.join('\n');
}

/** Boş: Vite dev’de ``/api`` → backend proxy. Üretimde ``VITE_API_BASE=http://host:8788`` */
function apiRecordingsUrl(): string {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? '';
  return `${base}/api/v1/recordings`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [gesture, setGesture] = useState<Gesture>('HAND_OPEN');
  const [durationSec, setDurationSec] = useState('3');
  const [serialOpen, setSerialOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [lastConnectionTest, setLastConnectionTest] = useState<string | null>(null);
  const [uploadingTakeId, setUploadingTakeId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [takes, setTakes] = useState<TakeRow[]>([]);
  const portRef = useRef<SerialPortLike | null>(null);
  const recordAbortRef = useRef(false);
  const recordingRef = useRef(false);
  const testingRef = useRef(false);

  const pushLog = useCallback((m: string) => {
    const t = new Date().toLocaleTimeString();
    setLog((prev) => [`[${t}] ${m}`, ...prev].slice(0, 40));
  }, []);

  const gestureSelectOptions = useMemo(
    () => GESTURE_OPTIONS.map((g) => ({ value: g, label: g })),
    [],
  );

  const uploadTakeToServer = useCallback(
    async (t: TakeRow) => {
      setUploadingTakeId(t.id);
      try {
        const r = await fetch(apiRecordingsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gesture: t.gesture,
            csv: buildPipelineRawCsv(t.samples),
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { detail?: unknown; saved?: string };
        if (!r.ok) {
          const d = j.detail;
          const msg =
            typeof d === 'string' ? d : Array.isArray(d) ? JSON.stringify(d) : r.statusText;
          throw new Error(msg || `HTTP ${r.status}`);
        }
        pushLog(`Sunucu: ${j.saved ?? 'kaydedildi'}`);
      } catch (e) {
        pushLog(`Sunucu yükleme: ${String(e)}`);
      } finally {
        setUploadingTakeId(null);
      }
    },
    [pushLog],
  );

  const onConnectSerial = useCallback(async () => {
    if (!webSerialOk()) {
      pushLog('Web Serial yok — Chrome veya Edge.');
      return;
    }
    try {
      const nav = navigator as unknown as { serial: { requestPort(): Promise<SerialPortLike> } };
      const p = await nav.serial.requestPort();
      await p.open({ baudRate: SERIAL_BAUD });
      portRef.current = p;
      setSerialOpen(true);
      setLastConnectionTest(null);
      pushLog(`Seri açık @ ${SERIAL_BAUD} — Arduino: raw,envelope satırları.`);
    } catch (e) {
      pushLog(`Bağlantı: ${String(e)}`);
    }
  }, [pushLog]);

  const onDisconnectSerial = useCallback(async () => {
    recordAbortRef.current = true;
    try {
      await portRef.current?.close();
    } catch {
      /* */
    }
    portRef.current = null;
    setSerialOpen(false);
    recordingRef.current = false;
    setRecording(false);
    testingRef.current = false;
    setTestingConnection(false);
    setLastConnectionTest(null);
    pushLog('Seri kapandı.');
  }, [pushLog]);

  const onTestConnection = useCallback(async () => {
    const p = portRef.current;
    if (!p?.readable || recordingRef.current || testingRef.current) return;
    const stream = p.readable;
    if (!stream) return;

    testingRef.current = true;
    setTestingConnection(true);
    recordAbortRef.current = false;
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let lineBuf = '';
    let parsedCount = 0;
    let lastSample: SampleRow | null = null;
    const t0 = performance.now();

    try {
      while (
        performance.now() - t0 < CONNECTION_TEST_MS &&
        !recordAbortRef.current &&
        parsedCount < 200
      ) {
        const { value, done } = await reader.read();
        if (done) break;
        lineBuf += dec.decode(value, { stream: true });
        const parts = lineBuf.split(/\r?\n/);
        lineBuf = parts.pop() ?? '';
        for (const line of parts) {
          const row = parseEmgDataLine(line);
          if (row) {
            parsedCount += 1;
            lastSample = row;
          }
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* */
      }
      try {
        reader.releaseLock();
      } catch {
        /* */
      }
      testingRef.current = false;
      setTestingConnection(false);
    }

    const elapsedMs = Math.round(performance.now() - t0);
    if (parsedCount > 0 && lastSample) {
      const env =
        lastSample.envelope != null && Number.isFinite(lastSample.envelope)
          ? String(lastSample.envelope)
          : '—';
      const msg = `OK · ${parsedCount} satır · ${elapsedMs}ms · son: raw=${lastSample.raw}, envelope=${env}`;
      setLastConnectionTest(msg);
      pushLog(`Bağlantı testi: ${msg}`);
    } else {
      const msg = `Veri yok (${elapsedMs}ms). raw_adc,envelope satırları ve ${SERIAL_BAUD} baud kontrol et.`;
      setLastConnectionTest(msg);
      pushLog(`Bağlantı testi: ${msg}`);
    }
  }, [pushLog]);

  const onRecord = useCallback(async () => {
    const p = portRef.current;
    if (!p?.readable || recordingRef.current || testingRef.current) return;
    const sec = Math.max(0.5, Math.min(30, Number.parseFloat(durationSec) || 3));
    const durMs = sec * 1000;
    const stream = p.readable;
    if (!stream) return;

    recordingRef.current = true;
    setRecording(true);
    recordAbortRef.current = false;
    const samples: SampleRow[] = [];
    const reader = stream.getReader();
    const dec = new TextDecoder();
    let lineBuf = '';
    const t0 = performance.now();

    try {
      while (performance.now() - t0 < durMs && !recordAbortRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        lineBuf += dec.decode(value, { stream: true });
        const parts = lineBuf.split(/\r?\n/);
        lineBuf = parts.pop() ?? '';
        for (const line of parts) {
          const row = parseEmgDataLine(line);
          if (row) samples.push(row);
        }
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        /* */
      }
      try {
        reader.releaseLock();
      } catch {
        /* */
      }
      recordingRef.current = false;
      setRecording(false);
    }

    const id = `${Date.now()}`;
    const createdAt = new Date().toISOString();
    setTakes((prev) => [{ id, gesture, durationSec: sec, samples, createdAt }, ...prev]);
    pushLog(`Kayıt: ${gesture} · ${samples.length} örnek · ${sec}s`);
    if (samples.length < PIPELINE_TOTAL_RECORD_SAMPLES) {
      pushLog(
        `Uyarı: pipeline için hedef ≥${PIPELINE_TOTAL_RECORD_SAMPLES} örnek @500Hz (~3s); faz etiketi yine yazıldı.`,
      );
    }
  }, [durationSec, gesture, pushLog]);

  return (
    <div className="min-h-full bg-bg-app text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-bg-surface/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Mic2 className="w-6 h-6 text-accent-primary" />
          <div>
            <h1 className="font-semibold text-lg leading-tight">EMG Label Collector</h1>
            <p className="text-xs text-muted-foreground font-mono">Aynı tema · Web Serial · CSV indir</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border ${
              serialOpen ? 'border-state-success/40 text-state-success' : 'border-border text-muted-foreground'
            }`}
            title={lastConnectionTest ?? undefined}
          >
            <Usb className="w-3.5 h-3.5" />
            {serialOpen ? 'Arduino' : 'Seri kapalı'}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <Card title="Kayıt">
          <div className="space-y-4">
            <Select
              label="Etiket (gesture)"
              options={gestureSelectOptions as { value: string; label: string }[]}
              value={gesture}
              onChange={(e) => setGesture(e.target.value as Gesture)}
              disabled={recording || testingConnection}
            />
            <Input
              label="Süre (saniye)"
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={durationSec}
              onChange={(e) => setDurationSec(e.target.value)}
              disabled={recording || testingConnection}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Seri: <span className="font-mono">raw_adc,envelope</span> (115200). İndirilen CSV:{' '}
              <span className="font-mono text-foreground">sample_index,raw_adc,phase</span> —{' '}
              <span className="font-mono">senior_project/data/&lt;GESTURE&gt;/instance_XXX.csv</span> olarak kaydet; ardından
              kökte <span className="font-mono">python preprocessor.py</span> → <span className="font-mono">extract_features.py</span>.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {!serialOpen ? (
                <Button
                  type="button"
                  onClick={() => void onConnectSerial()}
                  disabled={recording || testingConnection || !webSerialOk()}
                >
                  <Cable className="w-4 h-4" />
                  Web Serial bağlan
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onTestConnection()}
                    disabled={recording || testingConnection}
                    isLoading={testingConnection}
                  >
                    <Activity className="w-4 h-4" />
                    {testingConnection ? 'Test ediliyor…' : 'Bağlantıyı test et'}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => void onRecord()}
                    disabled={recording || testingConnection}
                    isLoading={recording}
                  >
                    {recording ? 'Kaydediliyor…' : `Kayıt al (${durationSec}s)`}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void onDisconnectSerial()}
                    disabled={recording || testingConnection}
                  >
                    <Square className="w-4 h-4" />
                    Bağlantıyı kes
                  </Button>
                </>
              )}
            </div>
            {serialOpen && lastConnectionTest ? (
              <p className="text-xs text-muted-foreground font-mono pt-1 border-t border-border">
                Son bağlantı testi: <span className="text-foreground">{lastConnectionTest}</span>
              </p>
            ) : null}
          </div>
        </Card>

        <Card title="Toplanan dosyalar">
          {takes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kayıt yok.</p>
          ) : (
            <ul className="space-y-2">
              {takes.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border last:border-0 text-sm font-mono"
                >
                  <div>
                    <span className="text-foreground font-medium">{t.gesture}</span>
                    <span className="text-muted-foreground"> · n={t.samples.length}</span>
                    <span className="text-muted-foreground"> · {t.durationSec}s</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        downloadText(
                          `instance_${t.gesture}_${t.id}.csv`,
                          buildPipelineRawCsv(t.samples),
                        )
                      }
                    >
                      <Download className="w-4 h-4" />
                      Pipeline CSV
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void uploadTakeToServer(t)}
                      disabled={uploadingTakeId === t.id}
                      isLoading={uploadingTakeId === t.id}
                    >
                      <Upload className="w-4 h-4" />
                      Sunucuya yaz
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Log">
          <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
            {log.length ? log.join('\n') : '—'}
          </pre>
        </Card>
      </main>
    </div>
  );
}
