import type { AudioMediaType } from "../../../shared/speech";

/** Raw audio Ukiyo can't turn into a playable file — a save failure, not a provider error (spec AC-20, ADR-0041). */
export class AudioConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioConversionError";
  }
}

const DEFAULT_RATE = 24_000;
const DEFAULT_CHANNELS = 1;
const BITS = 16;

function params(mediaType: string): { type: string; rate: number; channels: number } {
  const [type = "", ...rest] = mediaType
    .toLowerCase()
    .split(";")
    .map((p) => p.trim());
  const kv = Object.fromEntries(rest.map((p) => p.split("=").map((s) => s.trim())));
  const num = (v: string | undefined, d: number) => (v === undefined ? d : Number(v));
  return { type, rate: num(kv.rate, DEFAULT_RATE), channels: num(kv.channels, DEFAULT_CHANNELS) };
}

/** A 44-byte RIFF/WAVE header for 16-bit little-endian PCM — the samples stay as they are (lossless). */
function wavHeader(dataBytes: number, rate: number, channels: number): Uint8Array {
  const header = new Uint8Array(44);
  const v = new DataView(header.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  const blockAlign = channels * (BITS / 8);
  text(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, channels, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, BITS, true);
  text(36, "data");
  v.setUint32(40, dataBytes, true);
  return header;
}

/** mp3 passes through; raw PCM (`audio/pcm;rate=…;channels=…`) becomes a WAV file; anything else is refused. */
export function toPlayable(bytes: Uint8Array, mediaType: string): { bytes: Uint8Array; mediaType: AudioMediaType } {
  const { type, rate, channels } = params(mediaType);
  if (type === "audio/mpeg" || type === "audio/mp3") return { bytes, mediaType: "audio/mpeg" };
  if (type !== "audio/pcm" && type !== "audio/l16")
    throw new AudioConversionError(`Unsupported audio type: ${type || "none"}`);
  const validRate = Number.isInteger(rate) && rate > 0;
  const validChannels = Number.isInteger(channels) && channels > 0 && channels <= 8;
  if (!validRate || !validChannels) throw new AudioConversionError(`Unusable PCM parameters: ${mediaType}`);
  if (bytes.length === 0 || bytes.length % (channels * (BITS / 8)) !== 0)
    throw new AudioConversionError("The raw audio is incomplete");
  const out = new Uint8Array(44 + bytes.length);
  out.set(wavHeader(bytes.length, rate, channels), 0);
  out.set(bytes, 44);
  return { bytes: out, mediaType: "audio/wav" };
}
