import topics from "../data/topics.json" with { type: "json" };

const maxPlayers = (value) => Number(value.split("–")[1] ?? value.split("-")[1] ?? 99);
const horror = topics.filter((topic) => topic.horror >= 4);
const taichung = topics.filter((topic) => topic.city === "台中市");
const smallTeams = topics.filter((topic) => maxPlayers(topic.players) <= 4);

if (!horror.length || new Set(horror.map((topic) => topic.venue_id)).size < 2) throw new Error("恐怖篩選沒有形成跨店家主題結果");
if (!taichung.length || taichung.some((topic) => topic.city !== "台中市")) throw new Error("台中地區篩選錯誤");
if (!smallTeams.length || smallTeams.some((topic) => maxPlayers(topic.players) > 4)) throw new Error("2–4 人篩選錯誤");
if (new Set(topics.map((topic) => topic.id)).size !== topics.length) throw new Error("主題 ID 不唯一");
console.log(JSON.stringify({ total: topics.length, horror: horror.length, horrorVenues: new Set(horror.map((topic) => topic.venue_id)).size, taichung: taichung.length, smallTeams: smallTeams.length }));
