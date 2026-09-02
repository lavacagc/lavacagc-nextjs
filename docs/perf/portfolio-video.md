# Portfolio video weight

Measured on production, 1 September 2026.

## What was wrong

`/portfolio` took **10.4 seconds** to finish loading - the slowest page on the site,
and the one whose entire job is showing the work.
The browser was offered roughly **124 MB of video across 24 responses**.

Three source files sit behind that: **22 MB, 21 MB and 15 MB**, all
`video/quicktime` - uncompressed `.mov` straight off a camera, uploaded to Supabase
storage without transcoding.

Note the metric that did *not* catch this.
LCP on `/portfolio` was 596ms, comfortably "good".
The visitor sees content quickly; the browser then keeps working for another ten
seconds on things they cannot see, which on a phone is their battery and their data.

Two separate code causes, in two components:

- **`PortfolioContent`** (what `/portfolio` actually renders) had a bare
  `<video autoPlay loop>` with no lazy mount, no poster, and **no `preload`
  attribute at all**. Absent means `auto`, so every file began downloading in full
  on page load whether or not it was near the screen.
- **`ProjectGallery`** (the homepage strip) mounted its videos on scroll but called
  `observer.disconnect()` on the first intersection, so it stopped tracking
  visibility forever. With `autoPlay` + `loop`, every card ever scrolled past kept
  decoding and re-requesting for the life of the page.

## What was fixed in code

`src/components/LazyProjectVideo.tsx` now exists once and both galleries use it, so
the two cannot drift apart again:

- mounts when the card is within 100px of the viewport;
- **plays on enter, pauses on leave** - the observer stays connected;
- no `autoPlay`, so playback is decided in one place;
- `preload="none"` when a poster is available, `metadata` when not;
- the poster is a photograph **the project already has**, so this costs no new
  storage and no upload, and the card shows real work instead of a grey box.

Pinned by `tests/portfolio-video-weight.spec.ts`.

## DONE 1 September 2026

All 13 `.mov` rows transcoded, uploaded and repointed. **158.6 MB -> 29.5 MB of video,
81% smaller**, plus 1.5 MB of new poster stills. `/portfolio`'s load event went from
**10.4s to 1.4s** on production.

Two predictions in the original version of this document were WRONG, and are corrected
here rather than quietly edited out:

- **"Expect roughly 1-2 MB out of a 22 MB input... about a 90% reduction."** That assumed
  short phone clips. They are 720p videos up to **75 seconds** long at ~2.9 Mbps. The worst
  case only compressed 56% (21.7 -> 9.5 MB); the fleet average was 81% because most clips
  are short.
- **"Chrome ignores the container's label and sniffs the H.264 inside."** The codec was
  **HEVC (H.265)**, not H.264. It played on the Mac I measured on because Apple hardware
  decodes HEVC; Firefox cannot play it at all and Chrome needs platform support. So the
  transcode fixed a real COMPATIBILITY problem, not only weight - a bigger win than the
  size numbers show.

Settings actually used, chosen after comparing frames side by side (visually
indistinguishable from source, and the lightbox displays these at viewport size so
resolution was worth keeping):

```
ffmpeg -i input.mov -vf "scale='min(1280,iw)':-2,fps=24" \
  -c:v libx264 -profile:v high -crf 30 -preset slow -pix_fmt yuv420p \
  -an -movflags +faststart output.mp4
# poster, 1s in so it is not a black first frame:
ffmpeg -ss 1 -i input.mov -frames:v 1 -vf "scale='min(1280,iw)':-2" -q:v 4 output.poster.jpg
```

Originals were LEFT IN PLACE in storage - nothing was overwritten or deleted, so a bad
encode is recoverable by repointing `project_images.image_url` back to the `.mov`.

Uploads need BOTH `Authorization: Bearer` and `apikey` headers; the new-style
`sb_secret_...` keys answer `Invalid Compact JWS` with only the first.

**A regression this caused, and how it was caught.** Dropping `autoPlay` from the lazy
wrapper left the video never playing: the observer's first callback runs before the
element exists, so its `play()` is skipped, and it does not fire again while the card
stays in view. On production the element sat at `readyState 0` with zero bytes fetched -
a poster and nothing behind it. `autoPlay` is restored, and is safe here precisely because
the element only exists once the card is near the viewport.

## What is NOT fixed: the files themselves

The code change stops the site from *fetching* tens of megabytes unprompted.
It does not make the files smaller. A visitor who scrolls to a card and watches it
still pulls a 22 MB QuickTime.

Transcoding is deliberately left as a separate job because **it rewrites objects in
production storage**, which is not something to do as a side effect of a
performance fix.

### What transcoding should do

For each `.mov` in the `project-images` bucket:

```
ffmpeg -i input.mov \
  -vf "scale='min(1280,iw)':-2" \
  -c:v libx264 -profile:v high -crf 24 -preset slow \
  -an \                        # these autoplay muted; audio is dead weight
  -movflags +faststart \       # metadata first, so playback can start early
  output.mp4
```

Expect roughly **1-2 MB** out of a 22 MB input for a few seconds of footage - about
a 90% reduction. Keep `-an`: the players are muted, so shipping audio is pure cost.

Also worth doing at the same time:

- write a real poster JPEG per clip rather than relying on another project photo;
- store the MP4 alongside the original rather than replacing it, so nothing is lost
  if a re-encode is wrong;
- update `project_images.image_url` to the `.mp4` only after the new object is
  confirmed readable.

### Why `.mov` playing at all is a red herring

Chrome reports `canPlayType('video/quicktime') === ''`, which reads exactly like
"these videos are broken". They are not: every element reported `readyState: 4`
with no error, because Chrome ignores the container's declared type and sniffs the
H.264 inside.

Reporting them as broken would have been wrong, and the two possibilities are
indistinguishable from outside without inspecting media state. The problem is
weight, not playback.
