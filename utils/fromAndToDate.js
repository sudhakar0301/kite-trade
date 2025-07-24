//const { format } = require('date-fns'); // Make sure date-fns is installed
//const { toISTDate } = require('./timezone'); // Your existing helper if any
function toISTDate(date = new Date()) {
  return new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
}
const format = (d) => {
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
const now = toISTDate(); // Converts current UTC to IST (or just use new Date())

// Today's full trading session (9:15 to current time or 15:30)
const from1 = new Date();
from1.setDate(from1.getDate()); // Set to today (same as fromToday)
from1.setHours(9, 15, 0, 0);

// Set to1 to current time or 15:30, whichever is earlier (avoid future time)
const to1 = new Date();
const currentTime = new Date();
const marketClose = new Date();
marketClose.setHours(15, 30, 0, 0);

// Use current time if market is still open, otherwise use market close
if (currentTime < marketClose) {
  to1.setTime(currentTime.getTime());
} else {
  to1.setTime(marketClose.getTime());
}

const fromToday = new Date();
fromToday.setDate(fromToday.getDate()); // Set to today
fromToday.setHours(9, 15, 0, 0);

// 15 days ago trading session
const from15 = new Date();
from15.setDate(from15.getDate() - 15);
from15.setHours(9, 15, 0, 0);

const to15 = new Date();
to15.setDate(to15.getDate()); // Set to today
to15.setHours(15, 30, 0, 0);

const from35 = new Date();
from35.setDate(from35.getDate() - 50);
from35.setHours(9, 15, 0, 0);

// Format them to ISO strings (e.g. 2025-07-03T09:15:00Z)
const formattedFromDate = format(from1);
const formattedEndTime = format(to1);
const formattedFromDate15 = format(from15);
const formattedEndTime15 = format(to15);
const formattedFromToday = format(fromToday);
const formattedFrom35 = format(from35);

module.exports = {
  from1: formattedFromDate,
  to1: formattedEndTime,
  from15: formattedFromDate15,
  to15: formattedEndTime15,
  fromToday: formattedFromToday,
  from35: formattedFrom35,
};
