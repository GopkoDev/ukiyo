import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const STAGING = ".staging";
const GENERATIONS = "generations";
const AUDIO = "audio";
const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/wav": "wav" };
/** `audio/<ulid>.<ext>` — the only shape a recording's file path may have. */
const AUDIO_PATH = /^audio\/([0-9A-Z]{1,26})\.(mp3|wav)$/;

export type StoredImageInput = { bytes: Uint8Array; mediaType: string };

/**
 * Image files of generations under the data dir (ADR-0006): files are written to `.staging/<id>/`
 * and become visible only through one synchronous rename to `generations/<id>/`, which the caller
 * runs inside the DB transaction that records them.
 */
export function createFileStore(dataDir: string) {
  const root = resolve(dataDir);
  const stagingDir = (id: string) => join(root, STAGING, id);
  const finalDir = (id: string) => join(root, GENERATIONS, id);
  mkdirSync(join(root, STAGING), { recursive: true });

  /** A recording's file name, checked against the one allowed shape (defense in depth). */
  function audioName(relPath: string): string {
    if (!AUDIO_PATH.test(relPath)) throw new Error("Invalid audio file path");
    return relPath.slice(AUDIO.length + 1);
  }
  const audioFinal = (relPath: string) => join(root, AUDIO, audioName(relPath));
  const audioStaged = (relPath: string) => join(root, STAGING, `audio-${audioName(relPath)}`);
  const audioTrash = (relPath: string) => `${audioStaged(relPath)}.deleted`;

  async function writeStaged(id: string, kind: "output" | "input", images: StoredImageInput[]): Promise<string[]> {
    const dir = stagingDir(id);
    await mkdir(dir, { recursive: true });
    const paths: string[] = [];
    for (const [i, image] of images.entries()) {
      const name = `${kind}-${i + 1}.${EXT[image.mediaType] ?? "bin"}`;
      await writeFile(join(dir, name), image.bytes);
      paths.push(`${GENERATIONS}/${id}/${name}`);
    }
    return paths;
  }

  return {
    /** Writes the output images to staging; returns their final paths relative to the data dir, in order. */
    stage(id: string, images: StoredImageInput[]): Promise<string[]> {
      return writeStaged(id, "output", images);
    },

    /** Writes copies of the input images beside the outputs (`input-N.<ext>`), in attach order. */
    stageInputs(id: string, images: StoredImageInput[]): Promise<string[]> {
      return writeStaged(id, "input", images);
    },

    /** Moves a staged generation into place. Synchronous so it can run inside a SQLite transaction. */
    commitSync(id: string): void {
      const target = finalDir(id);
      if (existsSync(target)) throw new Error(`Generation directory already exists: ${id}`);
      mkdirSync(join(root, GENERATIONS), { recursive: true });
      renameSync(stagingDir(id), target);
    },

    /** Removes everything written for a generation that will not be recorded. */
    discard(id: string): void {
      rmSync(stagingDir(id), { recursive: true, force: true });
      rmSync(finalDir(id), { recursive: true, force: true });
    },

    /**
     * Deletion's file step (ADR-0014): moves `generations/<id>` to `.staging/<id>.deleted` synchronously, as the
     * last step of the DB transaction. A missing directory is «nothing to move»; a failed move throws.
     */
    trashSync(id: string): void {
      const source = finalDir(id);
      if (!existsSync(source)) return;
      const target = join(root, STAGING, `${id}.deleted`);
      rmSync(target, { recursive: true, force: true });
      renameSync(source, target);
    },

    /** Undoes `trashSync` when the deletion did not commit — the generation keeps its files. */
    restoreSync(id: string): void {
      const trashed = join(root, STAGING, `${id}.deleted`);
      if (!existsSync(trashed) || existsSync(finalDir(id))) return;
      mkdirSync(join(root, GENERATIONS), { recursive: true });
      renameSync(trashed, finalDir(id));
    },

    /** Removes a deleted generation's files after the deletion committed (the boot sweep covers a crash). */
    purge(id: string): void {
      rmSync(join(root, STAGING, `${id}.deleted`), { recursive: true, force: true });
    },

    /**
     * A recording's audio file (ADR-0042): written to `.staging/audio-<id>.<ext>`; returns its final path
     * `audio/<id>.<ext>`, which becomes visible only through `commitAudioSync` inside the DB transaction.
     */
    async stageAudio(id: string, bytes: Uint8Array, mediaType: string): Promise<string> {
      const ext = AUDIO_EXT[mediaType];
      if (!ext) throw new Error(`Unsupported audio type: ${mediaType}`);
      const relPath = `${AUDIO}/${id}.${ext}`;
      await writeFile(audioStaged(relPath), bytes);
      return relPath;
    },

    /** Moves a staged audio file into place. Synchronous so it can run inside a SQLite transaction. */
    commitAudioSync(relPath: string): void {
      const target = audioFinal(relPath);
      if (existsSync(target)) throw new Error(`Audio file already exists: ${relPath}`);
      mkdirSync(join(root, AUDIO), { recursive: true });
      renameSync(audioStaged(relPath), target);
    },

    /** Removes everything written for a recording that will not be recorded. */
    discardAudio(relPath: string): void {
      rmSync(audioStaged(relPath), { force: true });
      rmSync(audioFinal(relPath), { force: true });
    },

    /** Removes only the staged copy — a committed file with the same path may belong to another recording. */
    discardStagedAudio(relPath: string): void {
      rmSync(audioStaged(relPath), { force: true });
    },

    /** Deletion's file step: moves the file into staging as `<name>.deleted`, synchronously, inside the transaction. */
    trashAudioSync(relPath: string): void {
      const source = audioFinal(relPath);
      if (!existsSync(source)) return;
      rmSync(audioTrash(relPath), { force: true });
      renameSync(source, audioTrash(relPath));
    },

    /** Undoes `trashAudioSync` when the deletion did not commit — the recording keeps its file. */
    restoreAudioSync(relPath: string): void {
      const trashed = audioTrash(relPath);
      if (!existsSync(trashed) || existsSync(audioFinal(relPath))) return;
      mkdirSync(join(root, AUDIO), { recursive: true });
      renameSync(trashed, audioFinal(relPath));
    },

    /** Removes a deleted recording's file after the deletion committed (the boot sweep covers a crash). */
    purgeAudio(relPath: string): void {
      rmSync(audioTrash(relPath), { force: true });
    },

    /**
     * Boot clean-up: restores interrupted deletions of recorded generations and recordings, drops the rest of
     * staging and any generation directory without a record; with `knownRecordingIds`, also any audio file
     * without a recording (ADR-0042 — one sweep, run once both repos exist).
     */
    sweep(knownIds: Set<string>, knownRecordingIds?: Set<string>): void {
      // A deletion that never committed (crash / failed COMMIT) left a recorded generation's files in staging: put them back.
      const staging = join(root, STAGING);
      if (existsSync(staging))
        for (const name of readdirSync(staging)) {
          const id = name.endsWith(".deleted") ? name.slice(0, -".deleted".length) : null;
          if (id && knownIds.has(id) && !existsSync(finalDir(id))) {
            mkdirSync(join(root, GENERATIONS), { recursive: true });
            renameSync(join(staging, name), finalDir(id));
          }
          const audio = /^audio-(([0-9A-Z]{1,26})\.(mp3|wav))\.deleted$/.exec(name);
          if (audio?.[1] && audio[2] && knownRecordingIds?.has(audio[2])) this.restoreAudioSync(`${AUDIO}/${audio[1]}`);
        }
      rmSync(join(root, STAGING), { recursive: true, force: true });
      mkdirSync(join(root, STAGING), { recursive: true });
      const gens = join(root, GENERATIONS);
      if (existsSync(gens))
        for (const name of readdirSync(gens)) {
          if (!knownIds.has(name)) rmSync(join(gens, name), { recursive: true, force: true });
        }
      const audioDir = join(root, AUDIO);
      if (knownRecordingIds && existsSync(audioDir))
        for (const name of readdirSync(audioDir)) {
          const id = name.split(".")[0] ?? "";
          if (!knownRecordingIds.has(id)) rmSync(join(audioDir, name), { recursive: true, force: true });
        }
    },

    /** Size of a recorded file, or `null` when it is gone — checked before reading (no 10 MB+ reads). */
    async sizeRecorded(relPath: string): Promise<number | null> {
      try {
        return (await stat(this.resolveRecorded(relPath))).size; // resolveRecorded throws on an impossible path
      } catch {
        return null;
      }
    },

    /** Bytes of a file whose relative path is recorded in the DB (stored-image reuse, ADR-0017). */
    async readRecorded(relPath: string): Promise<Uint8Array> {
      return readFile(this.resolveRecorded(relPath)); // a Buffer is a Uint8Array — no 10 MB copy
    },

    /** Absolute path of a path recorded in the DB; refuses anything outside the data dir (defense in depth). */
    resolveRecorded(relPath: string): string {
      if (isAbsolute(relPath) || relPath.split(/[\\/]/).includes("..")) throw new Error("Invalid file path");
      const abs = resolve(root, relPath);
      if (relative(root, abs).startsWith("..")) throw new Error("Invalid file path");
      return abs;
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;
