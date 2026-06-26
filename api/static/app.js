(function () {
  function closeDropdowns() {
    document.querySelectorAll("[data-dropdown-menu]").forEach(function (menu) {
      menu.hidden = true;
    });
    document.querySelectorAll("[data-dropdown-trigger]").forEach(function (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", function (event) {
    var trigger = event.target.closest("[data-dropdown-trigger]");
    if (trigger) {
      var menu = trigger.parentElement.querySelector("[data-dropdown-menu]");
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      closeDropdowns();
      trigger.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (menu) {
        menu.hidden = expanded;
      }
      return;
    }

    if (!event.target.closest("[data-dropdown-menu]")) {
      closeDropdowns();
    }
  });

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-drawer-open]");
    if (open) {
      var drawer = document.getElementById(open.getAttribute("data-drawer-open"));
      if (drawer) {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }
    }

    if (event.target.closest("[data-drawer-close]")) {
      var activeDrawer = event.target.closest(".drawer") || document.querySelector(".drawer.open");
      if (activeDrawer) {
        activeDrawer.classList.remove("open");
        activeDrawer.setAttribute("aria-hidden", "true");
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeDropdowns();
      document.querySelectorAll(".drawer.open").forEach(function (drawer) {
        drawer.classList.remove("open");
        drawer.setAttribute("aria-hidden", "true");
      });
    }
  });

  document.body.addEventListener("htmx:configRequest", function (event) {
    var token = document
      .querySelector('meta[name="yuance-csrf-token"]')
      ?.getAttribute("content");
    if (token) {
      event.detail.headers["x-yuance-csrf-token"] = token;
    }
  });
})();
