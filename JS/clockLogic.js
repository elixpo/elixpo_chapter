const secondsCircleContainer = document.querySelector(".secondsCircleContainer");
const minutesCircleContainer = document.querySelector(".minutesCircleContainer");
const hoursCircleContainer = document.querySelector(".hoursCircleContainer");
const daysCircleContainer = document.querySelector(".daysCircleContainer");
const monthsCircleContainer = document.querySelector(".monthsCircleContainer");
const yearHolder = document.querySelector(".yearHolder");

const totalSegmentsSeconds = 60;
const totalSegmentsMinutes = 60;
const totalSegmentsHours = 24;
const totalSegmentsDays = 7;
const totalSegmentsMonths = 12;

const secondsOuterCircle = document.querySelector(".secondsOuterCircle");
const minutesOuterCircle = document.querySelector(".minutesOuterCircle");
const hoursOuterCircle = document.querySelector(".hoursOuterCircle");
const daysOuterCircle = document.querySelector(".daysOuterCircle");
const monthsOuterCircle = document.querySelector(".monthsOuterCircle");

const desiredRadiusSeconds = secondsOuterCircle ? Math.round(secondsOuterCircle.getBoundingClientRect().width / 2 - 3 + 20) : 0;
const desiredRadiusMinutes = minutesOuterCircle ? Math.round(minutesOuterCircle.getBoundingClientRect().width / 2 - 3 + 20) : 0;
const desiredRadiusHours = hoursOuterCircle ? Math.round(hoursOuterCircle.getBoundingClientRect().width / 2 - 3 + 20) : 0;
const desiredRadiusDays = daysOuterCircle ? Math.round(daysOuterCircle.getBoundingClientRect().width / 2 - 3 + 20) : 0;
const desiredRadiusMonths = monthsOuterCircle ? Math.round(monthsOuterCircle.getBoundingClientRect().width / 2 - 3 + 20) : 0;

const noHighlight = "#555";
const highlight = "#fff";

function PrepareSecondsCircle() {
  for (let i = 0; i < totalSegmentsSeconds; i++) {
    const angle = (360 / totalSegmentsSeconds) * i;
    const secondsNumber = document.createElement("div");
    secondsNumber.className = "secondsNumber";
    secondsNumber.innerText = i;
    secondsNumber.style.transform = `rotate(${-angle}deg) translateX(-8px) translateY(${desiredRadiusSeconds - 60}px)`;
    secondsCircleContainer.appendChild(secondsNumber);
  }

  for (let i = 0; i < totalSegmentsSeconds; i++) {
    const angle = (360 / totalSegmentsSeconds) * i;
    const secondsSegment = document.createElement("div");
    secondsSegment.className = "secondsSegment";
    secondsSegment.style.transform = `rotate(${-angle}deg) translateY(${desiredRadiusSeconds}px)`;
    secondsCircleContainer.appendChild(secondsSegment);
  }
}

function PrepareMinutesCircle() {
  for (let i = 0; i < totalSegmentsMinutes; i++) {
    const angle = (360 / totalSegmentsMinutes) * i;
    const minutesNumber = document.createElement("div");
    minutesNumber.className = "minutesNumber";
    minutesNumber.innerText = i;
    minutesNumber.style.transform = `rotate(${-angle}deg) translateX(-8px) translateY(${desiredRadiusMinutes - 60}px)`;
    minutesCircleContainer.appendChild(minutesNumber);
  }
  for (let i = 0; i < totalSegmentsMinutes; i++) {
    const angle = (360 / totalSegmentsMinutes) * i;
    const minutesSegment = document.createElement("div");
    minutesSegment.className = "minutesSegment";
    minutesSegment.style.transform = `rotate(${-angle}deg) translateY(${desiredRadiusMinutes}px)`;
    minutesCircleContainer.appendChild(minutesSegment);
  }
}

function PrepareHoursCircle() {
  for (let i = 0; i < totalSegmentsHours; i++) {
    const angle = (360 / totalSegmentsHours) * i;
    const hoursNumber = document.createElement("div");
    hoursNumber.className = "hoursNumber";
    hoursNumber.innerText = i;
    // hoursNumber.dataset.angle = angle;
    hoursNumber.style.transform = `rotate(${-angle}deg) translateX(-8px) translateY(${desiredRadiusHours - 60}px)`;
    hoursCircleContainer.appendChild(hoursNumber);
  }
  for (let i = 0; i < totalSegmentsHours; i++) {
    const angle = (360 / totalSegmentsHours) * i;
    const hoursSegment = document.createElement("div");
    hoursSegment.className = "hoursSegment";
    // hoursSegment.dataset.angle = angle;
    hoursSegment.style.transform = `rotate(${-angle}deg) translateY(${desiredRadiusHours}px)`;
    hoursCircleContainer.appendChild(hoursSegment);
  }
}

function PrepareDaysCircle() {
  const daysOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  for (let i = 0; i < totalSegmentsDays; i++) {
    const angle = (360 / totalSegmentsDays) * i;
    const daysNumber = document.createElement("div");
    daysNumber.className = "daysNumber";
    daysNumber.innerText = daysOfWeek[i];
    daysNumber.style.transform = `rotate(${-angle}deg) translateX(-25px) translateY(${desiredRadiusDays + 20}px)`;
    daysCircleContainer.appendChild(daysNumber);
  }
  for (let i = 0; i < totalSegmentsDays; i++) {
    const angle = (360 / totalSegmentsDays) * i;
    const daysSegment = document.createElement("div");
    daysSegment.className = "daysSegment";
    daysSegment.style.transform = `rotate(${-angle}deg) translateY(${desiredRadiusDays}px)`;
    daysCircleContainer.appendChild(daysSegment);
  }
}

function PrepareMonthsCircle() {
  const monthsOfYear = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  for (let i = 0; i < totalSegmentsMonths; i++) {
    const angle = (360 / totalSegmentsMonths) * i;
    const monthsNumber = document.createElement("div");
    monthsNumber.className = "monthsNumber";
    monthsNumber.innerText = monthsOfYear[i];
    monthsNumber.style.transform = `rotate(${-angle}deg) translateX(-20px) translateY(${desiredRadiusMonths + 20}px)`;
    monthsCircleContainer.appendChild(monthsNumber);
  }
  for (let i = 0; i < totalSegmentsMonths; i++) {
    const angle = (360 / totalSegmentsMonths) * i;
    const monthsSegment = document.createElement("div");
    monthsSegment.className = "monthsSegment";
    monthsSegment.style.transform = `rotate(${-angle}deg) translateY(${desiredRadiusMonths}px)`;
    monthsCircleContainer.appendChild(monthsSegment);
  }
}

function highlightCurrent(numberElements, segmentElements, currentIndex) {
  numberElements.forEach((el, i) => {
    if (i === currentIndex) {
      el.style.color = highlight;
      el.style.textShadow = "0 0 4px white";
    } else {
      el.style.color = noHighlight;
      el.style.textShadow = "none";
    }
  });

  segmentElements.forEach((el, i) => {
    if (i === currentIndex) {
      el.style.background = highlight;
      el.style.filter = "drop-shadow(0 0 4px white)";
    } else {
      el.style.background = noHighlight;
      el.style.filter = "none";
    }
  });
}

function updateClock() {
  const now = new Date(getTimeInTimezone(currentTimezone));
  const seconds = now.getSeconds();
  const minutes = now.getMinutes();
  const hours = now.getHours();
  const dayOfWeek = now.getDay();
  const month = now.getMonth();
  const year = now.getFullYear();

  // Update Year Display
  if (yearHolder) {
    yearHolder.innerText = year;
  }

  const secondsAngle = seconds * (360 / totalSegmentsSeconds);
  const minutesAngle = minutes * (360 / totalSegmentsMinutes);
  const hoursAngle = hours * (360 / totalSegmentsHours); // 24-hour format
  const daysAngle = dayOfWeek * (360 / totalSegmentsDays);
  const monthsAngle = month * (360 / totalSegmentsMonths);

  secondsCircleContainer.style.transform = `translateY(-300px) translateX(-50%) rotate(${secondsAngle}deg)`;
  minutesCircleContainer.style.transform = `translateY(-300px) translateX(-50%) rotate(${minutesAngle}deg)`;
  hoursCircleContainer.style.transform = `translateY(-300px) translateX(-50%) rotate(${hoursAngle}deg)`;
  daysCircleContainer.style.transform = `translateY(-330px) translateX(-50%) rotate(${daysAngle}deg)`;
  monthsCircleContainer.style.transform = `translateY(-330px) translateX(-50%) rotate(${monthsAngle}deg)`;

  const secondsNumbers = secondsCircleContainer.querySelectorAll(".secondsNumber");
  const secondsSegments = secondsCircleContainer.querySelectorAll(".secondsSegment");
  const minutesNumbers = minutesCircleContainer.querySelectorAll(".minutesNumber");
  const minutesSegments = minutesCircleContainer.querySelectorAll(".minutesSegment");
  const hoursNumbers = hoursCircleContainer.querySelectorAll(".hoursNumber");
  const hoursSegments = hoursCircleContainer.querySelectorAll(".hoursSegment");
  const daysNumbers = daysCircleContainer.querySelectorAll(".daysNumber");
  const daysSegments = daysCircleContainer.querySelectorAll(".daysSegment");
  const monthsNumbers = monthsCircleContainer.querySelectorAll(".monthsNumber");
  const monthsSegments = monthsCircleContainer.querySelectorAll(".monthsSegment");
  highlightCurrent(secondsNumbers, secondsSegments, seconds);
  highlightCurrent(minutesNumbers, minutesSegments, minutes);
  highlightCurrent(hoursNumbers, hoursSegments, hours);
  highlightCurrent(daysNumbers, daysSegments, dayOfWeek);
  highlightCurrent(monthsNumbers, monthsSegments, month);
}

PrepareSecondsCircle();
PrepareMinutesCircle();
PrepareHoursCircle();
PrepareDaysCircle();
PrepareMonthsCircle();
updateClock();
setInterval(updateClock, 1000);
