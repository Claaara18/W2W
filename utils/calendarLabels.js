// Label for the "add to calendar" button in the date pickers (Home / Match).
// Today → 儲存到今天 / 取代今天的穿搭; other days → 儲存到 M/D / 取代 M/D 的穿搭
export const saveToDayLabel = (year, month, day, hasEntry) => {
  const now = new Date();
  const today = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  if (today) return hasEntry ? '取代今天的穿搭' : '儲存到今天';
  const md = `${month + 1}/${day}`;
  return hasEntry ? `取代 ${md} 的穿搭` : `儲存到 ${md}`;
};
