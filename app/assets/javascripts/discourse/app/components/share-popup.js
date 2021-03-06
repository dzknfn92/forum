import discourseComputed, { bind } from "discourse-common/utils/decorators";
import { later, scheduleOnce } from "@ember/runloop";
import Component from "@ember/component";
import I18n from "I18n";
import Sharing from "discourse/lib/sharing";
import { alias } from "@ember/object/computed";
import { isEmpty } from "@ember/utils";
import { longDateNoYear } from "discourse/lib/formatter";
import { nativeShare } from "discourse/lib/pwa-utils";
import { wantsNewWindow } from "discourse/lib/intercept-click";

export default Component.extend({
  elementId: "share-link",
  classNameBindings: ["visible"],
  link: null,
  visible: null,
  privateCategory: alias("topic.category.read_restricted"),

  @discourseComputed("topic.{isPrivateMessage,invisible,category}")
  sources(topic) {
    const privateContext =
      this.siteSettings.login_required ||
      (topic && topic.isPrivateMessage) ||
      (topic && topic.invisible) ||
      this.privateCategory;

    return Sharing.activeSources(this.siteSettings.share_links, privateContext);
  },

  @discourseComputed("type", "postNumber")
  shareTitle(type, postNumber) {
    if (type === "topic") {
      return I18n.t("share.topic");
    }
    if (postNumber) {
      return I18n.t("share.post", { postNumber });
    }
    return I18n.t("share.topic");
  },

  @discourseComputed("date")
  displayDate(date) {
    return longDateNoYear(new Date(date));
  },

  _focusUrl() {
    // Wait for the fade-in transition to finish before selecting the link:
    later(() => {
      if (this.element) {
        const linkInput = this.element.querySelector("#share-link input");
        linkInput.value = this.link;
        if (!this.site.mobileView) {
          // if the input is auto-focused on mobile, iOS requires two taps of the copy button
          linkInput.setSelectionRange(0, this.link.length);
          linkInput.focus();
        }
      }
    }, 200);
  },

  _showUrl($target, url) {
    const currentTargetOffset = $target.offset();
    const $this = $(this.element);

    if (isEmpty(url)) {
      return;
    }

    // Relative urls
    if (url.indexOf("/") === 0) {
      url = window.location.protocol + "//" + window.location.host + url;
    }

    const shareLinkWidth = $this.width();
    let x = currentTargetOffset.left - shareLinkWidth / 2;
    if (x < 25) {
      x = 25;
    }
    if (x + shareLinkWidth > $(window).width()) {
      x -= shareLinkWidth / 2;
    }

    const header = $(".d-header");
    let y = currentTargetOffset.top - ($this.height() + 20);
    if (y < header.offset().top + header.height()) {
      y = currentTargetOffset.top + 10;
    }

    this.element.style.top = `${y}px`;

    if (!this.site.mobileView) {
      this.element.style.left = `${x}px`;
      if (document.documentElement.classList.contains("rtl")) {
        this.element.style.right = "unset";
      }
    }
    this.set("link", url);
    this.set("visible", true);

    scheduleOnce("afterRender", this, this._focusUrl);
  },

  @bind
  _mouseDownHandler(event) {
    if (!this.element || this.isDestroying || this.isDestroyed) {
      return;
    }

    // Use mousedown instead of click so this event is handled before routing occurs when a
    // link is clicked (which is a click event) while the share dialog is showing.
    if ($(this.element).has(event.target).length !== 0) {
      return;
    }

    this.send("close");

    return true;
  },

  @bind
  _clickHandler(event) {
    if (!this.element || this.isDestroying || this.isDestroyed) {
      return;
    }

    // if they want to open in a new tab, let it so
    if (wantsNewWindow(event)) {
      return true;
    }

    event.preventDefault();

    const $currentTarget = $(event.currentTarget);
    const url = $currentTarget.data("share-url");
    const postNumber = $currentTarget.data("post-number");
    const postId = $currentTarget.closest("article").data("post-id");
    const date = $currentTarget.children().data("time");

    this.setProperties({ postNumber, date, postId });

    // use native webshare only when the user clicks on the "chain" icon
    if (!$currentTarget.hasClass("post-date")) {
      nativeShare(this.capabilities, { url }).then(null, () =>
        this._showUrl($currentTarget, url)
      );
    } else {
      this._showUrl($currentTarget, url);
    }

    return false;
  },

  @bind
  _keydownHandler(event) {
    if (!this.element || this.isDestroying || this.isDestroyed) {
      return;
    }

    if (event.key === "Escape") {
      this.send("close");
    }
  },

  _shareUrlHandler(url, $target) {
    this._showUrl($target, url);
  },

  didInsertElement() {
    this._super(...arguments);

    $("html")
      .on("mousedown.outside-share-link", this._mouseDownHandler)
      .on(
        "click.discourse-share-link",
        "button[data-share-url], .post-info .post-date[data-share-url]",
        this._clickHandler
      )
      .on("keydown.share-view", this._keydownHandler);

    this.appEvents.on("share:url", this, "_shareUrlHandler");
  },

  willDestroyElement() {
    this._super(...arguments);

    $("html")
      .off("click.discourse-share-link", this._clickHandler)
      .off("mousedown.outside-share-link", this._mouseDownHandler)
      .off("keydown.share-view", this._keydownHandler);

    this.appEvents.off("share:url", this, "_shareUrlHandler");
  },

  actions: {
    replyAsNewTopic() {
      const postStream = this.get("topic.postStream");
      const postId = this.postId || postStream.findPostIdForPostNumber(1);
      const post = postStream.findLoadedPost(postId);
      this.replyAsNewTopic(post);
      this.send("close");
    },

    close() {
      this.setProperties({
        link: null,
        postNumber: null,
        postId: null,
        visible: false,
      });
    },

    share(source) {
      Sharing.shareSource(source, {
        url: this.link,
        title: this.get("topic.title"),
      });
    },
  },
});
