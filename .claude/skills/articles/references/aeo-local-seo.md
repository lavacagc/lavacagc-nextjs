# AEO and local-SEO checklist

AEO (answer engine optimisation) is how an article gets quoted by Google's AI answers, featured snippets and chat assistants.
Local SEO is how it ranks for people in the towns La Vaca serves.
Every new article passes every item; a refresh passes every item it touches.

## Answer-first (AEO)

- [ ] The title is the question or the topic in the words people search, under 60 characters when the meta title is left to default.
- [ ] The opening paragraph is a complete answer a machine could lift on its own: it names the subject, answers in the first sentence, and adds the one fact that matters most. 25 to 70 words, no link.
- [ ] Each `##` heading is a question or a clear task ("How long does it take?", "What changes the timeline"), and the first sentence under it answers it.
- [ ] Lists and short tables where the answer is a set of steps or options; one idea per bullet.
- [ ] The FAQ (`faq.json`) holds 2 to 6 questions people actually ask next, each answer one to three plain sentences that stand alone. It renders as a FAQ section and `FAQPage` structured data.
- [ ] `--meta-description` (optional) is one or two sentences under 155 characters that answer the question; left out, the opening is used.

## Local SEO

- [ ] At least one town and one county, the county from `counties` in the feedback and the town inside it, in the opening or the first `##` section, used naturally.
- [ ] The `service_area` fact sentence, worded as the fact says.
- [ ] Local specifics that are true and need no promise: housing stock, seasons and weather, what a homeowner should ask their town.
- [ ] Internal links that keep the visit local and on a path: the matching `/home-services/<slug>` or `/services/<slug>` page, a `/locations/<slug>` page for the town or county when one exists, and `/free-estimate`.
- [ ] No list of towns stuffed into a sentence; each place named once where it reads naturally.

## Every article

- [ ] One article answers one question; a second question gets its own article or a FAQ item.
- [ ] Category is one of the blog's: Kitchen Remodeling, Bathroom Renovation, Home Additions, Basement Finishing, General Remodeling, or the home service the article is about.
- [ ] `--keywords` (optional) holds the target query and two or three close variants, no more.
