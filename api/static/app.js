(function () {
  var DROPDOWN_TRANSITION_MS = 240;
  var PAGE_TRANSITION_MS = 150;
  var MODAL_TRANSITION_MS = 180;
  var AVATAR_COLORS = [
    "#1f5fbf",
    "#2d8a68",
    "#a85b00",
    "#b42318",
    "#4656a8",
    "#0f766e",
    "#7c3aed",
    "#be4b00",
  ];

  function avatarInitial(name) {
    var value = (name || "").trim();
    if (!value) {
      return "U";
    }
    return Array.from(value)[0].toLocaleUpperCase("zh-CN");
  }

  function hashText(value) {
    var hash = 2166136261;
    Array.from(value || "").forEach(function (char) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return hash >>> 0;
  }

  function initUserAvatars(root) {
    (root || document).querySelectorAll("[data-user-avatar]").forEach(function (avatar) {
      var name = avatar.getAttribute("data-avatar-name") || "";
      avatar.textContent = avatarInitial(name);
      avatar.style.backgroundColor = AVATAR_COLORS[hashText(name) % AVATAR_COLORS.length];
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isPlainWebNavigation(event, link) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download") ||
      link.hasAttribute("hx-get") ||
      link.hasAttribute("data-hx-get") ||
      link.hasAttribute("data-modal-open") ||
      link.hasAttribute("data-modal-close") ||
      link.closest("[data-dropdown-trigger]")
    ) {
      return false;
    }

    var nextUrl;
    try {
      nextUrl = new URL(link.href, window.location.href);
    } catch (_error) {
      return false;
    }
    if (nextUrl.origin !== window.location.origin || !nextUrl.pathname.startsWith("/web")) {
      return false;
    }

    var current = window.location.pathname + window.location.search;
    var next = nextUrl.pathname + nextUrl.search;
    return current !== next;
  }

  function navigateWithTransition(event, link) {
    if (!document.body.matches("[data-page-transition]") || prefersReducedMotion()) {
      return;
    }
    if (!isPlainWebNavigation(event, link)) {
      return;
    }

    event.preventDefault();
    closeDropdowns();
    closeModals();
    document.body.classList.add("page-leaving");
    window.setTimeout(function () {
      window.location.href = link.href;
    }, PAGE_TRANSITION_MS);
  }

  function closeDropdown(root) {
    if (!root) {
      return;
    }
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }
    if (root.dropdownCloseTimer) {
      window.clearTimeout(root.dropdownCloseTimer);
    }
    root.dataset.dropdownOpen = "false";
    root.dataset.hoverOpen = "false";
    trigger.setAttribute("aria-expanded", "false");
    menu.classList.remove("open");
    root.dropdownCloseTimer = window.setTimeout(function () {
      if (root.dataset.dropdownOpen !== "true") {
        menu.hidden = true;
      }
    }, DROPDOWN_TRANSITION_MS);
  }

  function closeDropdowns(exceptRoot) {
    document.querySelectorAll("[data-dropdown-root]").forEach(function (root) {
      if (root !== exceptRoot) {
        closeDropdown(root);
      }
    });
  }

  function openDropdown(root, openedByHover) {
    if (!root) {
      return;
    }
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }
    if (root.dropdownCloseTimer) {
      window.clearTimeout(root.dropdownCloseTimer);
    }
    closeDropdowns(root);
    root.dataset.dropdownOpen = "true";
    root.dataset.hoverOpen = openedByHover ? "true" : "false";
    trigger.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    window.requestAnimationFrame(function () {
      menu.classList.add("open");
    });
  }

  function closeDrawers() {
    document.querySelectorAll(".drawer.open").forEach(function (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    });
  }

  function modalFocusableElements(modal) {
    return Array.from(
      modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(function (item) {
      return !item.disabled && item.offsetParent !== null;
    });
  }

  function focusModal(modal) {
    var autofocus = modal.querySelector("[autofocus]");
    var focusable = modalFocusableElements(modal);
    var target = autofocus || focusable[0] || modal.querySelector(".modal-panel") || modal;
    window.setTimeout(function () {
      target.focus({ preventScroll: true });
    }, prefersReducedMotion() ? 0 : MODAL_TRANSITION_MS);
  }

  function openModal(modal, trigger) {
    if (!modal) {
      return;
    }
    closeDropdowns();
    closeDrawers();
    closeModals(modal);
    modal.lastModalTrigger = trigger || document.activeElement;
    if (modal.modalCloseTimer) {
      window.clearTimeout(modal.modalCloseTimer);
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(function () {
      modal.classList.add("open");
      focusModal(modal);
    });
  }

  function closeModal(modal, restoreFocus) {
    if (!modal || modal.hidden) {
      return;
    }
    if (modal.modalCloseTimer) {
      window.clearTimeout(modal.modalCloseTimer);
    }
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    modal.modalCloseTimer = window.setTimeout(function () {
      if (!modal.classList.contains("open")) {
        modal.hidden = true;
      }
      if (!document.querySelector("[data-modal].open")) {
        document.body.classList.remove("modal-open");
      }
      if (restoreFocus && modal.lastModalTrigger && document.contains(modal.lastModalTrigger)) {
        modal.lastModalTrigger.focus({ preventScroll: true });
      }
    }, prefersReducedMotion() ? 0 : MODAL_TRANSITION_MS);
  }

  function closeModals(exceptModal) {
    document.querySelectorAll("[data-modal].open").forEach(function (modal) {
      if (modal !== exceptModal) {
        closeModal(modal, false);
      }
    });
  }

  initUserAvatars();

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a[href]");
    if (link) {
      navigateWithTransition(event, link);
      if (event.defaultPrevented) {
        return;
      }
    }

    var modalOpen = event.target.closest("[data-modal-open]");
    if (modalOpen) {
      event.preventDefault();
      var modal = document.getElementById(modalOpen.getAttribute("data-modal-open"));
      openModal(modal, modalOpen);
      return;
    }

    var modalClose = event.target.closest("[data-modal-close]");
    if (modalClose) {
      event.preventDefault();
      var activeModal = modalClose.closest("[data-modal]") || document.querySelector("[data-modal].open");
      closeModal(activeModal, true);
      return;
    }

    var trigger = event.target.closest("[data-dropdown-trigger]");
    if (trigger) {
      var root = trigger.closest("[data-dropdown-root]") || trigger.parentElement;
      var menu = root.querySelector("[data-dropdown-menu]");
      var expanded = trigger.getAttribute("aria-expanded") === "true";
      var wasOpenedByHover = root.dataset.hoverOpen === "true";
      if (!menu) {
        return;
      }
      if (expanded && !wasOpenedByHover) {
        closeDropdown(root);
      } else {
        openDropdown(root, false);
      }
      return;
    }

    if (!event.target.closest("[data-dropdown-menu]")) {
      closeDropdowns();
    }
  });

  document.querySelectorAll("[data-dropdown-root]").forEach(function (root) {
    var trigger = root.querySelector("[data-dropdown-trigger]");
    var menu = root.querySelector("[data-dropdown-menu]");
    if (!trigger || !menu) {
      return;
    }

    root.addEventListener("mouseenter", function () {
      openDropdown(root, true);
    });

    root.addEventListener("mouseleave", function () {
      closeDropdown(root);
    });
  });

  document.addEventListener("click", function (event) {
    var open = event.target.closest("[data-drawer-open]");
    if (open) {
      closeDropdowns();
      closeModals();
      var drawer = document.getElementById(open.getAttribute("data-drawer-open"));
      if (drawer) {
        drawer.classList.add("open");
        drawer.setAttribute("aria-hidden", "false");
      }
    }

    if (event.target.closest("[data-drawer-close]")) {
      var activeDrawer = event.target.closest(".drawer") || document.querySelector(".drawer.open");
      if (activeDrawer) {
        closeDrawers();
      }
    }
  });

  document.addEventListener("keydown", function (event) {
    var activeModal = document.querySelector("[data-modal].open");
    if (event.key === "Tab" && activeModal) {
      var focusable = modalFocusableElements(activeModal);
      if (focusable.length === 0) {
        event.preventDefault();
        focusModal(activeModal);
        return;
      }
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      if (activeModal) {
        closeModal(activeModal, true);
        return;
      }
      closeDropdowns();
      closeDrawers();
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

  document.body.addEventListener("htmx:afterSwap", function (event) {
    initUserAvatars(event.target);
  });

  function syncPermissionParent(parent) {
    var scope = parent.closest("[data-permission-page]") || parent.closest("[data-permission-group]");
    if (!scope) {
      return;
    }

    var children = Array.from(scope.querySelectorAll("input[data-permission-node]")).filter(
      function (item) {
        return item !== parent && !item.disabled;
      }
    );
    if (children.length === 0) {
      parent.indeterminate = false;
      return;
    }

    var checkedCount = children.filter(function (item) {
      return item.checked;
    }).length;
    var isGroupParent = Boolean(parent.closest(".permission-group-head"));
    parent.indeterminate = checkedCount > 0 && checkedCount < children.length;
    if (isGroupParent) {
      parent.checked = checkedCount === children.length;
    } else if (checkedCount === children.length) {
      parent.checked = true;
    }
  }

  function syncPermissionTree(tree) {
    tree.querySelectorAll("[data-permission-page] input[data-permission-parent]").forEach(
      syncPermissionParent
    );
    tree.querySelectorAll("[data-permission-group] > .permission-group-head input[data-permission-parent]").forEach(
      syncPermissionParent
    );
  }

  document.querySelectorAll("[data-permission-tree]").forEach(syncPermissionTree);

  document.addEventListener("change", function (event) {
    var checkbox = event.target.closest("[data-permission-tree] input[type='checkbox']");
    if (!checkbox || checkbox.disabled) {
      return;
    }

    var page = checkbox.closest("[data-permission-page]");
    var group = checkbox.closest("[data-permission-group]");

    if (checkbox.matches("[data-permission-parent]")) {
      var scope = page || group;
      if (scope) {
        scope.querySelectorAll("input[data-permission-node]").forEach(function (child) {
          if (!child.disabled) {
            child.checked = checkbox.checked;
          }
        });
      }
    } else if (checkbox.checked && page) {
      var pageParent = page.querySelector(":scope > .permission-check input[data-permission-parent]");
      if (pageParent && !pageParent.disabled) {
        pageParent.checked = true;
      }
    }

    var tree = checkbox.closest("[data-permission-tree]");
    if (tree) {
      syncPermissionTree(tree);
    }
  });
})();
