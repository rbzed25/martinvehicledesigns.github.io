# Caden Martin — portfolio site

Plain HTML/CSS/JS, no build step. Hosted on GitHub Pages.

## Publish on GitHub Pages
1. Create a repository named `YOUR-USERNAME.github.io` (that gives the site the address https://YOUR-USERNAME.github.io).
2. Upload everything in this folder to the repository (on github.com: **Add file → Upload files**, drag the contents in, **Commit**).
3. Repository **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)` → **Save**. The site is live a minute or two later.
4. Custom domain (optional): Settings → Pages → Custom domain.

## Resume
Save the PDF as `assets/docs/Caden-Martin-Resume.pdf`. The resume links on the Contact page appear automatically once it's there.

## Adding a project
1. Copy `projects/992-cup.html` to a new name, e.g. `projects/supercharged-964.html`, and edit the text, facts and photo list.
2. Put its photos in `assets/img/<project>/` and its 3D model in `assets/models/`.
3. On `index.html`, copy the `<a class="work-card">` block for the new project.
4. Optionally add a few of its photos to the mouse-trail list (`data-images` on the `.trail` element in `index.html`).

## Folder layout
- `index.html` — home: name, photo trail, project cards
- `projects/` — one page per project (3D viewer, write-up, gallery, downloads)
- `contact.html` — email, Instagram, bio, resume
- `assets/models/` — web 3D models (.glb, compressed)
- `assets/img/` — photos (.webp), `trail/` = small images for the mouse trail
- `assets/js/vendor/` — three.js (MIT license) for the 3D viewer
