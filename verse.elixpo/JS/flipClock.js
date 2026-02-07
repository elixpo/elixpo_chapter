function createDigitStrip(container) {
  const digitContainer = document.createElement("div");
  digitContainer.className = "digitContainer";

  const digitStrip = document.createElement("div");
  digitStrip.className = "digitStrip";

  for (let i = 0; i < 10; i++) {
    const digit = document.createElement("div");
    digit.className = "digit";
    digit.textContent = i;
    digitStrip.appendChild(digit);
  }

  digitContainer.appendChild(digitStrip);
  container.appendChild(digitContainer);
  return digitStrip;
}

function setupClock() {
  const groups = {
    Hours: document.querySelector('[data-label="Hours"]'),
    Minutes: document.querySelector('[data-label="Minutes"]'),
    Seconds: document.querySelector('[data-label="Seconds"]'),
  };

  const digitStrips = {
    Hours: [],
    Minutes: [],
    Seconds: [],
  };

  for (let label in groups) {
    for (let i = 0; i < 2; i++) {
      digitStrips[label].push(createDigitStrip(groups[label]));
    }
  }

  function updateDigits() {
    const now = new Date(getTimeInTimezone(currentTimezone));
    const time = {
      Hours: String(now.getHours()).padStart(2, "0"),
      Minutes: String(now.getMinutes()).padStart(2, "0"),
      Seconds: String(now.getSeconds()).padStart(2, "0"),
    };

    for (let label in time) {
      const digits = time[label].split("");
      digits.forEach((num, i) => {
        const digitStrip = digitStrips[label][i];
        digitStrip.style.transition = "transform 0.5s ease, background-color 0.5s ease";
        digitStrip.style.transform = `translateY(-${parseInt(num) * 50}px)`;
      });
    }
    const amOrPm = now.getHours() >= 12 ? "PM" : "AM";
    document.getElementById("am_or_pm").textContent = amOrPm;
  }

  updateDigits();
  setInterval(updateDigits, 1000);
}

setupClock();
