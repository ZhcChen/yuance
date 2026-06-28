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
