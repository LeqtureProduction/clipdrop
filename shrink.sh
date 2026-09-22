#!/usr/bin/env bash
#
# Shrink a video to fit Clip Drop's 25 MB upload limit.
#
#   ./shrink.sh input.mov            -> input-small.mp4, aiming at 23 MB
#   ./shrink.sh input.mov 10         -> aims at 10 MB instead
#
# Needs ffmpeg. If you don't have it:
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
#   brew install ffmpeg
#
# Two-pass encoding is what makes the target size reliable: the first pass
# measures the footage, the second spends the bitrate budget where it's needed.

set -euo pipefail

IN=${1:-}
TARGET_MB=${2:-23}          # 23 rather than 25, to leave headroom for container overhead
AUDIO_KBPS=128
MAX_WIDTH=1280

if [ -z "$IN" ]; then
  echo "usage: $0 <video file> [target MB]" >&2
  exit 1
fi

if [ ! -f "$IN" ]; then
  echo "No such file: $IN" >&2
  exit 1
fi

for tool in ffmpeg ffprobe; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "$tool is not installed. See the comment at the top of this script." >&2
    exit 1
  }
done

OUT="${IN%.*}-small.mp4"

DURATION=$(ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 "$IN")

if [ -z "$DURATION" ] || [ "${DURATION%.*}" -le 0 ] 2>/dev/null; then
  echo "Couldn't read a duration from $IN — is it really a video?" >&2
  exit 1
fi

# 1 MB = 8192 kilobits. Budget the audio track out of the total first.
TOTAL_KBPS=$(awk "BEGIN { printf \"%d\", ($TARGET_MB * 8192) / $DURATION }")
VIDEO_KBPS=$((TOTAL_KBPS - AUDIO_KBPS))

if [ "$VIDEO_KBPS" -lt 100 ]; then
  echo "This clip is ${DURATION%.*}s long — fitting it into ${TARGET_MB} MB leaves only" >&2
  echo "${VIDEO_KBPS}kbps for video, which will look bad. Trim it, or raise the target." >&2
  exit 1
fi

echo "Duration:   ${DURATION%.*}s"
echo "Target:     ${TARGET_MB} MB"
echo "Video rate: ${VIDEO_KBPS}kbps"
echo

LOG=$(mktemp -t shrink)
trap 'rm -f "$LOG"-0.log "$LOG"-0.log.mbtree "$LOG"' EXIT

# Cap the width but never upscale, and keep dimensions even (H.264 requires it).
SCALE="scale='min($MAX_WIDTH,iw)':-2"

ffmpeg -hide_banner -loglevel error -stats -y -i "$IN" \
  -vf "$SCALE" -c:v libx264 -b:v "${VIDEO_KBPS}k" \
  -pass 1 -passlogfile "$LOG" -an -f null /dev/null

ffmpeg -hide_banner -loglevel error -stats -y -i "$IN" \
  -vf "$SCALE" -c:v libx264 -b:v "${VIDEO_KBPS}k" \
  -pass 2 -passlogfile "$LOG" \
  -c:a aac -b:a "${AUDIO_KBPS}k" \
  -movflags +faststart \
  "$OUT"

echo
SIZE=$(ls -lh "$OUT" | awk '{print $5}')
echo "Wrote $OUT ($SIZE)"
