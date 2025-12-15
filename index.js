import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); // Reusable delay

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: "./chrome-profile", // We need directory to be able to permanently enable unsecure sites
    args: [
      "--disable-extensions", // Just in case
      "--ignore-certificate-errors",
      "--allow-insecure-localhost",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-features=BlockInsecurePrivateNetworkRequests"
    ]
  });

  // Create pupp page
  const page = await browser.newPage();

  // Set chrome download location to current folder
  const client = await page.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: path.join(process.cwd(), "hashes"),
  })

  try {
    await page.goto("http://redump.org/discs/system/ps2/", { waitUntil: "domcontentloaded" });
  } catch (err) {
    console.log("Navigation warning:", err.message);
  }

  page.on("requestfailed", req => {
    if (req.failure()?.errorText.includes("ERR_BLOCKED_BY_CLIENT")) {
      // ignore silently, this error prompts most of the time
    }
  });

  const gamesTable = await page.$$("table.games tr"); // If games table changes names, etc
  const games = [];                                   // Change it here

  console.log("Searching for games. This may take a while depending on your hardware.")

  // Store all games in table in array [ link , title ]
  for (const game of gamesTable) {
    const links = await game.$$eval("a", as =>
        as
            .filter(a => a.href.includes("/disc/")) // all <a> who's href includes /disc/ (games titles)
            .map(a => ({
                href: a.href,
                text: a.textContent.trim()
            }))
    );

    games.push(...links)
  }

  console.log(`Found ${games.length} games, downloading hashes...`)

  for (let i = 0; i < games.length; i++) {
    await page.goto(games[i].href, { waitUntil: "domcontentloaded"});

    await delay(500); // 500ms delay before clicking download

    // Click first instance of MD5 (download link)
    await page.evaluate(() => {
        const link = [...document.querySelectorAll("a")]
        .find(a => a.textContent.includes("MD5"));
    if (link) link.click()
    });
    
    // Getting the game title
    const gameTitle = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        return h1 ? h1.textContent.trim() : null;
    });
    console.log(`Downloaded hash for ${gameTitle}`)

    await delay(2500); // Delaying 2.5 seconds between downloads (better safe than sorry, etc)
  }

  // Write games found to json
  fs.writeFileSync("games.json", JSON.stringify(games, null, 2));
  console.log("foundGames.json");
}

main();