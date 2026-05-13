/**
 * ``senior_project/config.py`` ile senkron — ``emg_record_core`` CSV çıktısı.
 * Arduino gerçek Hz farklı olsa bile faz etiketi bu varsayılan 500 Hz zaman eksenine göre yazılır
 * (``extract_features.movement_slice`` ile uyumlu).
 */
export const PIPELINE_SAMPLE_RATE_HZ = 500;
export const PIPELINE_RECORD_REST_BEFORE_S = 0.5;
export const PIPELINE_RECORD_MOVEMENT_S = 2.0;
export const PIPELINE_RECORD_REST_AFTER_S = 0.5;

export const PIPELINE_PHASE_REST_BEFORE = 0;
export const PIPELINE_PHASE_MOVEMENT = 1;
export const PIPELINE_PHASE_REST_AFTER = 2;

export const PIPELINE_TOTAL_RECORD_SECONDS =
  PIPELINE_RECORD_REST_BEFORE_S + PIPELINE_RECORD_MOVEMENT_S + PIPELINE_RECORD_REST_AFTER_S;

export const PIPELINE_TOTAL_RECORD_SAMPLES = Math.round(
  PIPELINE_TOTAL_RECORD_SECONDS * PIPELINE_SAMPLE_RATE_HZ,
);

/** ``i`` = 0 tabanlı örnek indeksi (``sample_index`` ile aynı). */
export function pipelinePhaseForSampleIndex(i: number): number {
  const t = i / PIPELINE_SAMPLE_RATE_HZ;
  if (t < PIPELINE_RECORD_REST_BEFORE_S) return PIPELINE_PHASE_REST_BEFORE;
  if (t < PIPELINE_RECORD_REST_BEFORE_S + PIPELINE_RECORD_MOVEMENT_S) return PIPELINE_PHASE_MOVEMENT;
  return PIPELINE_PHASE_REST_AFTER;
}
