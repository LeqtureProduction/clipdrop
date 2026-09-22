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
- `/watch/<id>` — the player page. This is the link to hand out.
- `/v/<id>` — the raw video file. Plays in any browser tab, works in an
  `<video>` tag on another site.

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
