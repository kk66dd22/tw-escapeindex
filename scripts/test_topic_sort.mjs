import topics from "../data/topics.json" with { type: "json" };

const sortBy = (items, key) => [...items].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1));
const isDescending = (items, key) => items.every((item, index) => index === 0 || (items[index - 1][key] ?? -1) >= (item[key] ?? -1));
const rating = sortBy(topics, "google_rating");
const horror = sortBy(topics, "horror");
const brain = sortBy(topics, "brain");
const taichungHorror = sortBy(topics.filter((topic) => topic.city === "台中市" && topic.horror >= 4), "horror");
if (!isDescending(rating, "google_rating") || !isDescending(horror, "horror") || !isDescending(brain, "brain")) throw new Error("排序未保持降冪順序");
if (!taichungHorror.length || taichungHorror.some((topic) => topic.city !== "台中市" || topic.horror < 4)) throw new Error("排序與地區／恐怖篩選交集錯誤");
console.log(JSON.stringify({ ratingTop: rating[0].google_rating, horrorTop: horror[0].horror, brainTop: brain[0].brain, taichungHorror: taichungHorror.length }));
