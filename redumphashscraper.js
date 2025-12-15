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
  });

  try {
    await page.goto("http://redump.org/discs/system/ps2/", { waitUntil: "domcontentloaded" });
  } catch (err) {
    console.log("Navigation warning:", err.message);
  }

  // Attach requestfailed handler once
  page.on("requestfailed", req => {
    if (req.failure()?.errorText.includes("ERR_BLOCKED_BY_CLIENT")) {
      // ignore silently
      return;
    }
  });

  // Getting results, calculating page number, setting variables, etc
  const resultsNumber = await page.evaluate(() => {
    const el = [...document.querySelectorAll("b")]
        .find(b => b.textContent.includes("Displaying results"));
    if (!el) return null;

    const match = el.textContent.match(/of\s+(\d+)/);
    return match ? match[1] : null;
    });

  const pages = Math.ceil(Number(resultsNumber) / 500); // 500 games a page, could change

  await delay(1000); // Wait before requesting again & scraping

  for (let i = 0; i < pages; i++) {

    try {
      await page.goto(`http://redump.org/discs/system/ps2/?page=${i + 1}`, { waitUntil: "domcontentloaded" });
    } catch (err) {
      console.log("Navigation warning:", err.message);
    }

    const gamesTable = await page.$$("table.games tr");
    const games = [];

    console.log(`Searching page ${i + 1} for games. This may take a while depending on your hardware.`);

    // Store all games in table in array [ link , title ]
    for (const game of gamesTable) {
      const links = await game.$$eval("a", as =>
        as
          .filter(a => a.href.includes("/disc/"))
          .map(a => ({
            href: a.href,
            text: a.textContent.trim()
          }))
      );

      if (links.length === 0) continue;

      const edition = await game.evaluate(tr => {
        const tdS = tr.querySelectorAll("td");
        return tdS[4] ? tdS[4].textContent.trim() : null;
      });

      if (edition !== "Original") continue; // Hardcoded, we are only grabbing original PS2 games

      for (const link of links) {
        games.push({
          ...link,
          edition
        });
      }
    }

    console.log(`Found ${games.length} games, downloading hashes...`);

    for (let i = 0; i < games.length; i++) {
      await page.goto(games[i].href, { waitUntil: "domcontentloaded" });

      await delay(200);

      // Click first instance of MD5 (download link)
      await page.evaluate(() => {
        const link = [...document.querySelectorAll("a")]
          .find(a => a.textContent.includes("MD5"));
        if (link) link.click();
      });

      // Getting the game title
      const gameTitle = await page.evaluate(() => {
        const h1 = document.querySelector("h1");
        return h1 ? h1.textContent.trim() : null;
      });
      console.log(`Downloaded hash for ${gameTitle}`);

      await delay(750);
    }

    // Write games found to json
    fs.writeFileSync("games.json", JSON.stringify(games, null, 2));
  }

  await browser.close();
}

main();
