import puppeteer from "puppeteer";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import got from "got";
import PQueue from "p-queue";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms)); // Reusable delay

// Reusable file exists check
async function fileExists(dir, filename) {
  try {
    await fs.access(path.join(dir, filename))
      return true;
    } catch {
      return false;
    }
  }

// Sanitize game names
function sanitize(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
}

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
  const allGames = [];

  await delay(1000); // Wait before requesting again & scraping

  for (let i = 0; i < pages; i++) {

    try {
      await page.goto(`http://redump.org/discs/system/ps2/?page=${i + 1}`, { waitUntil: "domcontentloaded" });
    } catch (err) {
      console.log("Navigation warning:", err.message);
    }

    const gamesTable = await page.$$("table.games tr");

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
        allGames.push({
          ...link,
          edition
        });
      }
    }

    console.log(`Found ${allGames.length} games, downloading hashes in 3 seconds...`);
    await delay(3000);

    const downloadUrls = [];
    let rejected = 0;

    // Getting download links for all games
    for (let i = 0; i < allGames.length; i++) {
      const filename = `${sanitize(allGames[i].text)}.md5`;
      const downloaded = await fileExists("./hashes", filename);

      if (!downloaded) {
        downloadUrls.push({
          url: allGames[i].href + "md5",
          name: allGames[i].text
        });
      } else if (downloaded) {
        rejected++;
      }
    };

    if (rejected > 0) {
      console.log(`Already had ${rejected} hashes`)
    }

    console.log("Page finished, downloading hashes...")
    await delay(150);

    for (const download of downloadUrls) {
      await queue.add(() => downloadHash(download.url, download.name));
    }

    console.log("Downloads finished. Continuing...")
    await delay(150);
  }

  // Write games found to json
    fsSync.writeFileSync("games.json", JSON.stringify(allGames, null, 2));

  await browser.close();
}

// --- Download Function --- //
// Queue 
const queue = new PQueue({
  concurrency: 10,
  interval: 1000,
  intervalCap: 10
});

async function downloadHash(url, name) {
  const finalName = sanitize(name);
  const dir = path.join(process.cwd(), "hashes");
  fsSync.mkdirSync(dir, { recursive: true });

  const fileName = path.join(dir, `${finalName}.md5`)

  console.log(`Downloading ${url} -> ${finalName}`);

  const stream = got.stream(url);
  await delay(250);
  const fileWriter = fsSync.createWriteStream(fileName);

  return new Promise((resolve, reject) => {
    stream.pipe(fileWriter);

    stream.on("error", reject);
    fileWriter.on("finish", resolve);
    fileWriter.on("error", reject);
  });
}
main();
