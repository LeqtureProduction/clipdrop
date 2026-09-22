# Clip Drop

Upload a video, get a public link that plays it. No sign-in for viewers.

Runs on Netlify: a static page, three edge functions, and Netlify Blobs for storage.

## Deploying

Nothing needs installing. Netlify's build servers handle Node, npm and the
dependency install; you just need a GitHub account and a Netlify account.

**1. Get this folder onto GitHub — entirely in the browser.**

Create an empty repository at https://github.com/new (no README, no .gitignore).
On the next screen click **uploading an existing file**, then drag the *contents*
of this folder onto the page — `public/`, `netlify/`, `netlify.toml`,
`package.json`, `README.md`. GitHub keeps the folder structure. Write a commit
message and click **Commit changes**.

Drag the contents, not the `clip-drop` folder itself, so `netlify.toml` lands at
the top level of the repo. Netlify won't find it otherwise.

*If you'd rather use the command line:* macOS ships a stub `git` that isn't
really installed. Run `xcode-select --install`, accept the dialog, wait for it to
finish, and then the usual `git init && git add . && git commit && git push`
works.

**2. Connect it to Netlify.**

At https://app.netlify.com → *Add new site* → *Import an existing project* →
GitHub → pick the repo. Leave the build settings alone; `netlify.toml` already
sets the publish directory to `public` and there's no build command. Click
*Deploy*.

**3. Set the upload passphrase.**

In the new site → *Site configuration* → *Environment variables* → *Add a
variable*:

- Key: `UPLOAD_PASSPHRASE`
- Value: whatever you want

Then *Deploys* → *Trigger deploy* → *Clear cache and deploy site* so the
functions pick it up.

> If you skip this step the site still works, but **anyone who finds the URL can
> upload to your storage.** Set it.

## Using it

- `/` — drop a video, see everything uploaded so far. Enter the passphrase once;
  it's remembered in your browser.
- `/watch/<id>` — the player page, with the title, file details and both links.
- `/v/<id>` — the video on its own. Opened in a browser tab it's a bare,
  full-bleed looping player with no chrome around it. Referenced from a
  `<video>` tag, fetched, or downloaded, it's the plain MP4.
- `/v/<id>?raw=1` — always the plain MP4, never the player page.

Both player surfaces loop. `/v/<id>` also autoplays, which browsers only permit
while muted, so it starts silent and unmutes on your first click or keypress.

Viewers need nothing. No account, no sign-in.

## Limits

| Thing | Limit | Why |
|---|---|---|
| Upload size | **25 MB** | Netlify's edge function request body cap |
| Stored object | 5 GB | Netlify Blobs — not the binding constraint here |
| Storage total | Depends on your Netlify plan | |

The 25 MB ceiling is the one that will bite. It's a platform limit, not a
setting. To go bigger you'd slice the file in the browser, upload the pieces
separately, and reassemble them on read — a real change, not a config tweak.

Worth knowing before you go chasing bigger uploads: Netlify bills bandwidth, and
video is almost pure bandwidth. Serving a 200 MB file a thousand times is 200 GB
of egress. If you end up hosting large videos regularly, object storage with free
egress (Cloudflare R2) costs dramatically less than any CDN-billed host.

## Getting under 25 MB

**No install:** QuickTime Player (already on your Mac) → open the video →
*File* → *Export As* → *720p*. Usually enough for screen recordings.

**Exact target size:** `./shrink.sh myvideo.mov` writes `myvideo-small.mp4`
aiming at 23 MB, or `./shrink.sh myvideo.mov 10` for 10 MB. It measures the
duration, works out the bitrate budget, and two-pass encodes to hit it. Needs
`ffmpeg` — the script tells you how to install it if you don't have it.

Both routes re-encode to H.264 with `faststart`, which puts the file's index at
the front so playback can begin before the whole file arrives.

## How it fits together

```
public/index.html              the whole UI: upload, library, player
netlify/edge-functions/
  upload.ts    POST   /api/upload   passphrase check, writes to Blobs
  clips.ts     GET    /api/clips    lists clips (metadata only)
               DELETE /api/clips    removes one, passphrase required
  watch.ts     GET    /v/*          serves bytes, with Range support
netlify.toml                   publish dir + /watch/* rewrite to the page
```

`watch.ts` implements HTTP Range requests. Without that, browsers can play a
video but can't seek in it — the scrubber goes dead. That's the one piece worth
not simplifying away.

## A note on the passphrase

It gates uploads and deletes, nothing else. It's a shared secret sent in a
header and kept in `localStorage` — enough to stop a stranger who finds the URL
from filling your storage, not a real authentication system. Don't reuse a
password you care about, and assume anyone you give it to can upload and delete
anything.
