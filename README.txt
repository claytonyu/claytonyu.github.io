COMPUTATIONAL BIOLOGY PORTFOLIO

FILES
- index.html       Home page
- about.html       About page
- projects.html    Projects page
- styles.css       Shared styling and color variables
- script.js        Project pop-up behavior

QUICK EDITS
1. Replace every [placeholder] with your information.
2. In styles.css, edit the variables under :root to change colors.
3. Replace placeholder image URLs with local images, e.g. images/headshot.jpg.
4. Copy a project <article> block in projects.html to add more projects.
5. To add a new page:
   - copy about.html as a starting point,
   - rename it,
   - add its link to the navbars in each HTML file,
   - optionally add a homepage page-link card.

For a larger site, you may eventually want to use a static-site generator so the navbar/footer do not have to be copied manually, but this version intentionally stays simple HTML/CSS/JS for easy editing.

INTERACTIVE CELL NAVIGATION
---------------------------
The home page uses three matching data attributes:

1. Page card: data-cell-anchor="nucleus"
2. SVG anchor marker: data-cell-anchor-marker="nucleus"
3. SVG organelle group: data-cell-source="nucleus"

cell-navigation.js connects matching names automatically.

To change which organelle a card points to, normally you only need to edit
that card's data-cell-anchor value in index.html.

Existing anchor names included in the SVG:
- nucleus
- golgi
- mitochondrion
- er
- ribosome
- membrane

To add a new page card:
1. Add its page to the navbar on each HTML page.
2. Copy one .cell-page-card block in index.html.
3. Change href, text, and data-cell-anchor.

To create a completely new cell anchor:
1. Add data-cell-source="your-name" to the relevant SVG organelle group.
2. Put a <circle class="cell-anchor-marker" ... data-cell-anchor-marker="your-name"/>
   where you want the leader line to begin.
3. Use data-cell-anchor="your-name" on the card.
