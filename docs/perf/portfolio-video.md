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
