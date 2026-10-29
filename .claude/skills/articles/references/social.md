# Social copy

Every published article gets ready-made posts for Alex to paste (decision 006, Q22).
Write them after the article is created and before the publish, because `publish --social <file>` checks them and carries the caption in the "New article published" Telegram.

## The file

Save it in the repo as `docs/social/<slug>.md`, exactly this shape (the publish route reads these headings):

```markdown
# Social copy: <article title>

Article: https://www.lavacagc.com/blog/<slug>
Date: <today, YYYY-MM-DD>

## Instagram and Facebook
<hook line>

<three plain sentences>

<call to the service page, with its URL>

## Google Business
<post>

## X
<post>

## Hashtags
#one #two #three
```

On the local rig the `Article:` URL uses the rig's origin; the route checks only that it ends in `/blog/<slug>`.

## Each post

| Post | Limit | What it holds |
| --- | --- | --- |
| Instagram and Facebook caption | 2,200 characters | A hook line that names the reader's problem; three plain sentences with the article's answer; a call to the matching service page (`https://www.lavacagc.com/home-services/<slug>` or `/services/<slug>`), or `/free-estimate` when no service fits. |
| Google Business post | 1,500 characters | The answer in two or three sentences, the county from the article, and the article URL. |
| X post | 280 characters, URL included | One sentence of the answer and the article URL. |
| Hashtags | 3 to 5 | Each `#` plus letters and digits only: the service, the county, and NJ home topics (`#BergenCounty`, `#NJHomes`, `#GutterCleaning`). |

## Checklist (the publish route enforces every item)

- [ ] The same price rule as the article: no figure, percentage, discount or "costs N", except a home service's main starting price exactly as the site shows it, stated as a starting price in the same post that names that service.
- [ ] The same legal rule: none of the guard's legal words (permit, code, warranty, guarantee, insured, bonded, liability, lawsuit, legal, ADA, OSHA, EPA, lead-safe, asbestos, mold remediation), unless a whole sentence is a locked `claim_*` fact, word for word.
- [ ] Every fact in a post is in the article; nothing new is claimed on social.
- [ ] Plain English at grade 8 or below, the same voice as the article ("you" for the homeowner, "we" for La Vaca).
- [ ] Each post within its limit; 3 to 5 hashtags.

If the publish exits 2 with "The social copy did not pass", nothing was published: fix the file and publish again.
A caption too long for one Telegram (4,096 characters with the rest of the message) is cut there with a note; the file keeps the whole copy.
