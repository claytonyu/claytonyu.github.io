# Welcome to Clayton Yu's Portfolio Page!
15-113 Project 1 Comments
- I used AI for most of actual code generation, but I took part in leading design choices.
- See each file for their respective comments.
- I used multiple browser agents for this project and tailored usage to the purposes I wanted to achieve. These decisions are mainly based on my preexisting knowledge of different agents.
  - Main code generation: *ChatGPT*. Since we have access to Plus through being a student, I wasn't worried about running out of usage.
  - SVG Generation: *Claude*. I believe Claude tends to be better in code generation, but usage limits are pretty small in my experience. I wanted the cell SVG to look presentable, so Claude could perform well focused on this smaller task.
  - Explanation: *Gemini*. Gemini, in my experience, isn't as good at generating code one-shot, but I use it a lot to explain concepts to me. Many of my conversations were transient (using "AI Overview"), but I have a sample of one I had in the prompt log below.
- The largest challenge I faced was getting the cell SVG & navigation system to work correctly.
  - The navigation system worked well: ChatGPT had set up a ID-based system that was easily extendable; each ID (e.g. nucleus) has a location in the cell; and is referenced by its corresponding card.
  - But the cell itself didn't appear that great (and to be honest, I will probably update this in the near future). I offloaded this task to Claude, which was able to generate, preview what it generated, and iterate.
  - As I add more pages to my portfolio, I want to "label" more parts of the cell. For example, a mitochondrion could link to my skills/interests, if I decide to split that from my About page.
- Check out my [Prompt Log](<Prompt Log.pdf>)!

# ChatGPT-generated (& human altered) README for Maintainance/Updating:

## IDEAS
- Migrate to Jekyll or other SSG to prevent code duplication
- Add courses / blog page (could be ER in diagram?)
- Fill About page with more information
- Add tutoring page
- Update cell diagram
- Change image layout for modal popup in projects.html
- Remove svgs from index.html and add to assets folder

## FILES
- index.html       Home page
- about.html       About page
- projects.html    Projects page
- styles.css       Shared styling and color variables
- script.js        Project pop-up behavior
- cell-navigation.js        Visual diagram for Navigation on the Home page

## To add new pages:
1. Replace placeholder image URLs with local images, e.g. images/headshot.jpg.
2. Copy a project <article> block in projects.html to add more projects.
3. To add a new page:
   - copy about.html as a starting point,
   - rename it,
   - add its link to the navbars in each HTML file,
   - optionally add a homepage page-link card.

For a larger site, you may eventually want to use a static-site generator so the navbar/footer do not have to be copied manually, but this version intentionally stays simple HTML/CSS/JS for easy editing.

## INTERACTIVE CELL NAVIGATION
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
