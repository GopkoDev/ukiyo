import { describe, expect, it } from "vitest";
import { AudioConversionError, toPlayable } from "./wav";

const pcm = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256));
const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.slice(at, at + len));

describe("toPlayable", () => {
  it("keeps mp3 as it came", () => {
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 4]);
    expect(toPlayable(mp3, "audio/mpeg")).toEqual({ bytes: mp3, mediaType: "audio/mpeg" });
    expect(toPlayable(mp3, "audio/mpeg;charset=binary").mediaType).toBe("audio/mpeg");
  });

  it("wraps raw 16-bit PCM in a WAV header with the stated rate and channels, samples unchanged", () => {
    const samples = pcm(400);
    const { bytes, mediaType } = toPlayable(samples, "audio/pcm;rate=44100;channels=2");
    expect(mediaType).toBe("audio/wav");
    expect(bytes.length).toBe(44 + 400);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(ascii(bytes, 0, 4)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(36 + 400);
    expect(ascii(bytes, 8, 4)).toBe("WAVE");
    expect(ascii(bytes, 12, 4)).toBe("fmt ");
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44_100);
    expect(v.getUint32(28, true)).toBe(44_100 * 2 * 2); // byte rate
    expect(v.getUint16(32, true)).toBe(4); // block align
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(bytes, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(400);
    expect(bytes.slice(44)).toEqual(samples);
  });

  it("defaults to 24 000 Hz mono when the type states no rate", () => {
    const { bytes } = toPlayable(pcm(4), "audio/pcm");
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(24_000);
  });

  it("refuses audio it can't make playable", () => {
    expect(() => toPlayable(pcm(3), "audio/pcm")).toThrow(AudioConversionError);
    expect(() => toPlayable(new Uint8Array(0), "audio/pcm")).toThrow(AudioConversionError);
    expect(() => toPlayable(pcm(4), "audio/pcm;rate=0")).toThrow(AudioConversionError);
    expect(() => toPlayable(pcm(8), "audio/ogg")).toThrow(AudioConversionError);
    // RFC 2586 L16 is big-endian; WAV PCM is little-endian — refused rather than saved as noise
    expect(() => toPlayable(pcm(8), "audio/L16;rate=24000")).toThrow(AudioConversionError);
  });
});
