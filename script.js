(function () {
  "use strict";

  // true — имитация сервера (работает без бэкенда);
  // false — настоящий fetch на адрес из action формы
  const MOCK = true;

  const form = document.querySelector("#booking form");
  const status = document.getElementById("form-status");
  const submitBtn = form.querySelector('button[type="submit"]');
  const startInput = document.getElementById("start");
  const phoneInput = document.getElementById("phone");
  const consoleSelect = document.getElementById("console"); // ПРАВКА 6

  // Все поля, кроме радиокнопок (у них всегда есть выбранное значение)
  const fields = Array.from(form.querySelectorAll("input, select")).filter(
    (field) => field.type !== "radio",
  );

  let sending = false;

  // ---------- 1. Минимальная и максимальная дата ----------
  function toLocalISODate(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const today = new Date();
  startInput.min = toLocalISODate(today);

  // ПРАВКА 2: max = сегодня + 90 дней
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);
  startInput.max = toLocalISODate(maxDate);

  // ---------- 2. Маска телефона: +7 999 123-45-67 ----------
  function formatPhone(raw, isDeleting) {
    let digits = raw.replace(/\D/g, "");

    // Если осталась только «семёрка» после стирания — очищаем поле целиком,
    // иначе маска вернёт «+7» и поле нельзя будет очистить Backspace'ом.
    if (isDeleting && digits.length <= 1) return "";
    if (!digits) return "";

    // 8XXXXXXXXXX -> 7XXXXXXXXXX; 9XXXXXXXXX -> 79XXXXXXXXX
    if (digits[0] === "8") digits = "7" + digits.slice(1);
    else if (digits[0] !== "7") digits = "7" + digits;

    const rest = digits.slice(1, 11); // 10 цифр после кода страны

    let result = "+7";
    if (rest.length > 0) result += " " + rest.slice(0, 3);
    if (rest.length > 3) result += " " + rest.slice(3, 6);
    if (rest.length > 6) result += "-" + rest.slice(6, 8);
    if (rest.length > 8) result += "-" + rest.slice(8, 10);
    return result;
  }

  phoneInput.addEventListener("input", (event) => {
    const isDeleting =
      Boolean(event.inputType) && event.inputType.startsWith("delete");
    phoneInput.value = formatPhone(phoneInput.value, isDeleting);
  });

  // ---------- 3. Тексты ошибок через field.validity ----------
  const MESSAGES = {
    name: {
      valueMissing: "Введите имя",
      tooShort: "Имя должно быть не короче 2 символов",
    },
    phone: {
      valueMissing: "Введите телефон",
    },
    console: {
      valueMissing: "Выберите приставку",
    },
    start: {
      badInput: "Введите дату полностью",
      valueMissing: "Выберите дату начала аренды",
      rangeUnderflow: "Дата не может быть в прошлом",
      rangeOverflow: "Дата не может быть позже чем через 90 дней", // ПРАВКА 2
    },
    address: {
      valueMissing: "Введите адрес доставки",
    },
    consent: {
      valueMissing: "Нужно согласие на обработку персональных данных",
    },
  };

  function getCustomError(field) {
    // Только пробелы в обязательном текстовом поле = пустое поле
    if (
      field.required &&
      field.type === "text" &&
      field.value &&
      !field.value.trim()
    ) {
      return MESSAGES[field.id].valueMissing;
    }

    // ПРАВКА 2: телефон — ровно 11 цифр И начинается с 7
    if (field.id === "phone" && field.value) {
      const digits = field.value.replace(/\D/g, "");
      if (digits.length !== 11 || digits[0] !== "7") {
        return "Введите номер полностью, например +7 999 123-45-67";
      }
    }

    return "";
  }

  function getErrorMessage(field) {
    field.setCustomValidity(getCustomError(field));

    if (field.validity.valid) return "";
    if (field.validity.customError) return field.validationMessage;

    const messages = MESSAGES[field.id] || {};
    for (const reason in messages) {
      if (field.validity[reason]) return messages[reason];
    }

    return field.validationMessage;
  }

  // ---------- 4. Показать / убрать ошибку ----------
  fields.forEach((field) => {
    field.dataset.baseDescribedby =
      field.getAttribute("aria-describedby") || "";
  });

  function setFieldState(field, message) {
    const errorEl = document.getElementById(`${field.id}-error`);
    const base = field.dataset.baseDescribedby;

    if (message) {
      errorEl.textContent = `Ошибка: ${message}`;
      errorEl.hidden = false;
      field.setAttribute("aria-invalid", "true");
      field.setAttribute(
        "aria-describedby",
        [base, errorEl.id].filter(Boolean).join(" "),
      );
    } else {
      errorEl.textContent = "";
      errorEl.hidden = true;
      field.removeAttribute("aria-invalid");
      if (base) {
        field.setAttribute("aria-describedby", base);
      } else {
        field.removeAttribute("aria-describedby");
      }
    }
    return !message;
  }

  function validateField(field) {
    return setFieldState(field, getErrorMessage(field));
  }

  // ---------- 5. Когда проверять ----------
  form.addEventListener("focusout", (event) => {
    if (fields.includes(event.target)) validateField(event.target);
  });

  function revalidateIfInvalid(event) {
    const field = event.target;
    if (fields.includes(field) && field.hasAttribute("aria-invalid")) {
      validateField(field);
    }
  }
  form.addEventListener("input", revalidateIfInvalid);
  form.addEventListener("change", revalidateIfInvalid);

  // ---------- 6. ПРАВКА 6: клик по «Арендовать» в каталоге ----------
  document.querySelectorAll("a[data-console]").forEach((link) => {
    link.addEventListener("click", () => {
      if (!consoleSelect) return;
      consoleSelect.value = link.dataset.console;
      // Если у select уже была показана ошибка — перевалидируем
      if (consoleSelect.hasAttribute("aria-invalid")) {
        validateField(consoleSelect);
      }
    });
  });

  // ---------- 7. Отправка ----------
  const FIELD_NAMES = {
    name: "Имя",
    phone: "Телефон",
    console: "Приставка",
    start: "Дата начала аренды",
    address: "Адрес доставки",
    consent: "Согласие на обработку данных",
  };

  async function sendForm(data) {
    if (MOCK) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      return;
    }
    const response = await fetch(form.action, { method: "POST", body: data });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }

  // ПРАВКА 1: disabled вместо aria-disabled + класс для CSS
  function setSending(isSending) {
    sending = isSending;
    submitBtn.disabled = isSending;
    submitBtn.classList.toggle("is-sending", isSending);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;

    status.textContent = "";

    const invalidFields = fields.filter((field) => !validateField(field));

    if (invalidFields.length > 0) {
      const names = invalidFields.map(
        (field) => FIELD_NAMES[field.id] || field.id,
      );
      status.textContent = `Заявка не отправлена. Проверьте: ${names.join(", ")}.`;
      invalidFields[0].focus();
      return;
    }

    setSending(true);
    try {
      await sendForm(new FormData(form));
      form.reset();
      fields.forEach((field) => setFieldState(field, ""));

      // ПРАВКА 4: фокус на статус после успеха — скринридер озвучит
      status.textContent =
        "Спасибо! Заявка отправлена. Перезвоним в течение 15 минут.";
      status.focus();
    } catch (error) {
      status.textContent =
        "Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.";
      // При ошибке тоже фокусируем — пользователь должен услышать сообщение
      status.focus();
    } finally {
      setSending(false);
    }
  });
})();

// ====================================================
// Мобильное меню
// ====================================================
(function () {
  "use strict";

  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  const desktop = window.matchMedia("(min-width: 768px)");

  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
  }

  // Кнопка открывает и закрывает меню
  toggle.addEventListener("click", () => setOpen(!isOpen()));

  // Клик по ссылке меню закрывает его (страница сама прокрутится к якорю)
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });

  // Клик вне меню закрывает его
  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });

  // Escape закрывает; если фокус был в меню, возвращаем его на кнопку
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    const focusWasInMenu = nav.contains(document.activeElement);
    setOpen(false);
    if (focusWasInMenu) toggle.focus();
  });

  // При переходе на широкий экран сбрасываем состояние
  desktop.addEventListener("change", (event) => {
    if (event.matches) setOpen(false);
  });
})();

// ====================================================
// Аккордеон FAQ: открытие одного пункта закрывает остальные
// ====================================================
(function () {
  "use strict";

  const items = document.querySelectorAll("#faq details");

  items.forEach((item) => {
    // Событие toggle не всплывает, поэтому вешаем его на каждый <details>
    item.addEventListener("toggle", () => {
      if (!item.open) return;
      items.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
})();
