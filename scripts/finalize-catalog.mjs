import fs from "node:fs";

const full = JSON.parse(fs.readFileSync("src/data/full-catalog.json", "utf8"));
const imgs = JSON.parse(fs.readFileSync("src/data/wiki-item-images.json", "utf8"));
const u = imgs.urlByKey;

const map = {
  "Lvl 2 Axe": "axelvl2",
  "Lvl 2 Pickaxe": "pickaxelvl2",
  "Lvl 2 Sword": "swordlvl2",
  "Magma Brute Pet": "magmabrute",
  "Molten Backwards Cap": "lavabackwardcap",
  "Molten Pants": "lavapants",
  "Molten Shoes": "lavaboots",
  "Molten T-shirt": "lavatshirt",
  "Red Laser Eyes": "redlasereyes",
  "Solana T-shirt": "solanatshirt",
  "Spain Jersey": "spainjersey",
  "White I Love KINS": "whiteilovekins",
  "Gold Whale Mount": "whalegold",
  "Night Skull Hoodie": "skullhoodie",
  "Smoky Cat": "smokycat",
  "MOG Pit Vipers": "mogglasses",
  "Venomweaver Boots": "venomweavershoes",
  "Venomweaver Chestplate": "venomweavertop",
  "Venomweaver Helm": "venomweaverhat",
  "Venomweaver Legguards": "venomweaverpants",
  "Unc Tanline": "tanline",
  "Demon Wings": "angelwings",
};

for (const it of full.items) {
  const key = map[it.name];
  if (key && u[key]) it.imageUrl = u[key];
  if (!it.imageUrl) {
    const tries = [
      it.name.toLowerCase().replace(/lvl 2 /g, "") + "lvl2",
      it.name.toLowerCase().replace(/ /g, ""),
      it.name
        .toLowerCase()
        .replace(/molten /g, "lava ")
        .replace(/[^a-z0-9]+/g, ""),
    ].map((s) => s.replace(/[^a-z0-9]+/g, ""));
    for (const t of tries) {
      if (u[t]) {
        it.imageUrl = u[t];
        break;
      }
    }
  }
  // refresh aliases for market types
  const base = it.name.toLowerCase();
  it.aliases = Array.from(
    new Set([
      ...(it.aliases || []),
      it.name,
      it.id,
      it.id.replace(/-/g, "_"),
      base.replace(/ /g, "_"),
      base.replace(/ /g, ""),
    ]),
  );
}

full.items = full.items.filter(
  (i) =>
    !i.name.startsWith("Update:") &&
    i.name !== "$KINS" &&
    i.name !== "Whisperwood" &&
    i.name !== "The Alchemist",
);
full.items.sort((a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
);
full.count = full.items.length;
full.withImages = full.items.filter((i) => i.imageUrl).length;
full.generatedAt = new Date().toISOString();
fs.writeFileSync("src/data/full-catalog.json", JSON.stringify(full, null, 2));

for (const it of full.items) {
  if (!it.imageUrl) continue;
  u[it.id] = it.imageUrl;
  u[it.id.replace(/-/g, "_")] = it.imageUrl;
  u[it.name.toLowerCase()] = it.imageUrl;
  u[it.name.toLowerCase().replace(/[^a-z0-9]+/g, "")] = it.imageUrl;
}
imgs.urlByKey = u;
imgs.keyCount = Object.keys(u).length;
imgs.generatedAt = new Date().toISOString();
fs.writeFileSync("src/data/wiki-item-images.json", JSON.stringify(imgs));

console.log("final", full.count, "with images", full.withImages);
console.log(
  "missing",
  full.items.filter((i) => !i.imageUrl).map((i) => i.name).join(" | "),
);
