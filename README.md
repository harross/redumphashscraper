# redumphashscraper
---
### What this tool is

Redump hash scraper, and it's wonderfully imaginative name were invented to solve a problem I came across when trying to create another node project, and that's that .md5 hashes for PS2 games can be kind of hard to find. 
Not only that, but when/if you do find a data source, it could be out of date, not include all games, be incorrect, etc.

The best source we know of for .md5 game hashes is http://redump.org.

Therefore, this tool/script allows a user to scrape all PS2 games stored in Redump.org, download their hashes, and save them in a directory along with their names. 

### Usage

`node ./index.js`

Yes, it has not been compiledm packaged or renamed yet.

### How it works

Written in node.js, and using Puppeteer, this tool is quite simple, 70-100 lines. It works in the following way:
- We visit http://redump.org, on the PS2 section
- The program searches for and grabs all game titles, and the links behind them, storing these values in an array.
- For each game title, we visit the games URL, again using puppeteer to scan for, and click the download link.
- You are left with a /hashes/ directory of all .md5 hashes, for all PS2 games found on the page.
- The program also outputs a simple .json file, showing all games found and their respective links
- Generous delays are included to limit requests and avoid bans/rate limiting, these can be adjusted at your own risk.

### Where it's going

Soon, I will be adding:
- The ability to use pagination and grab all titles at once (simple fix)
- The ability to download hashes for all platforms, not just PS2

This program exists to be a seed for my other project - a PS2 iso .md5 verifying tool. 
