# Epic — voice-presets

Roadmap step 21: named voice presets on the Speech page, truthful links from recordings, a Voices section with each preset's recordings. Spec [spec.md](../spec.md) · SAD [sad.md](../sad.md) · ADR-0057…0060.

```mermaid
flowchart LR
  T1[T1 migration] --> T3[T3 presets CRUD]
  T2[T2 shared schemas] --> T3
  T3 --> T4[T4 links + preset filter]
  T4 --> T5[T5 NFRs]
  T4 --> T6[T6 client + routing]
  T6 --> T7[T7 Speech preset row]
  T6 --> T8[T8 Voices pages]
  T7 --> T9[T9 docs]
  T8 --> T9
```
