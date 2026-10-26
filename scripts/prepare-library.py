#!/usr/bin/env python3
"""Recreate bundled, attributed practice excerpts. Requires curl and ffmpeg.

Normal builds use the committed MP3s and never download music. This optional
maintenance command uses source URLs, hashes, and excerpt grids in catalog.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare(track, cache, force):
    destination = ROOT / "public" / track["url"].lstrip("/")
    if destination.exists() and not force:
        return f"Kept {track['id']}"
    if track["license"] != "CC BY 3.0":
        raise ValueError(f"Review the source license before preparing {track['id']}")
    original = cache / f"{track['id']}.mp3"
    if not original.exists():
        partial = original.with_suffix(".download")
        subprocess.run([
            "curl", "--fail", "--location", "--retry", "3", "--silent",
            "--show-error", "--output", str(partial), track["download"],
        ], check=True)
        partial.replace(original)
    if sha256(original) != track["sourceSha256"]:
        raise ValueError(f"Original source changed for {track['id']}; review before replacing assets")
    duration = track["beats"] * 60 / track["bpm"]
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(".part.mp3")
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-ss", str(track["excerptStart"]), "-i", str(original), "-t", str(duration),
        "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "44100",
        "-af", f"asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.005,afade=t=out:st={duration-.005}:d=0.005",
        "-codec:a", "libmp3lame", "-b:a", "160k", "-map_metadata", "-1",
        "-metadata", f"title={track['title']} (Bit Cheer practice excerpt)",
        "-metadata", f"artist={track['artist']}",
        "-metadata", f"copyright={track['license']} — {track['source']}",
        "-metadata", f"comment={track['changes']} {track['licenseUrl']}",
        str(partial),
    ], check=True)
    partial.replace(destination)
    return f"Prepared {track['id']}: {duration:.2f}s"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("/tmp/bit-cheer-library"))
    parser.add_argument("--force", action="store_true", help="Re-encode existing practice files")
    parser.add_argument("--track", action="append", help="Prepare only these catalog IDs")
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    tracks = json.loads((ROOT / "public/catalog.json").read_text())["tracks"]
    if args.track:
        requested = set(args.track)
        missing = requested - {track["id"] for track in tracks}
        if missing:
            parser.error(f"Unknown track IDs: {', '.join(sorted(missing))}")
        tracks = [track for track in tracks if track["id"] in requested]
    with ThreadPoolExecutor(max_workers=4) as pool:
        for message in pool.map(lambda track: prepare(track, args.cache_dir, args.force), tracks):
            print(message, flush=True)


if __name__ == "__main__":
    main()
