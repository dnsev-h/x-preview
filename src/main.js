/* jshint eqnull:true, noarg:true, noempty:true, eqeqeq:true, bitwise:false, strict:true, undef:true, curly:false, browser:true, devel:true, newcap:false, maxerr:50 */
/* globals GM_xmlhttpRequest */
(function () {
	"use strict";

	/*#{begin_debug:timing=true}#*/

	var config = {
		show_info: true, // Show the title information of the page
		show_full_info: true, // Shows information related to the full image
		show_full_image: true, // Fetch and show the full image
		hide_original_tooltip: true, // Hide the original tool tip on images
		open_delay: 0.25, // Delay before showing the preview, in seconds
		full_image_throttle: 1.0, // Minimum wait before requesting another full page
	};

	var MutationObserver = (function () {

		var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver || null;

		if (MutationObserver === null) {
			throw "Browser not supported";
		}

		return MutationObserver;

	})();

	var $ = (function () {

		var d = document;

		var $ = function (selector, root) {
			return (root || d).querySelector(selector);
		};

		$.ready = (function () {

			var callbacks = [],
				check_interval = null,
				check_interval_time = 250;

			var callback_check = function () {
				if (
					(document.readyState === "interactive" || document.readyState === "complete") &&
					callbacks !== null
				) {
					var cbs = callbacks,
						cb_count = cbs.length,
						i;

					callbacks = null;

					for (i = 0; i < cb_count; ++i) {
						cbs[i].call(null);
					}

					window.removeEventListener("load", callback_check, false);
					window.removeEventListener("DOMContentLoaded", callback_check, false);
					document.removeEventListener("readystatechange", callback_check, false);

					if (check_interval !== null) {
						clearInterval(check_interval);
						check_interval = null;
					}

					return true;
				}

				return false;
			};

			window.addEventListener("load", callback_check, false);
			window.addEventListener("DOMContentLoaded", callback_check, false);
			document.addEventListener("readystatechange", callback_check, false);

			return function (cb) {
				if (callbacks === null) {
					cb.call(null);
				}
				else {
					callbacks.push(cb);
					if (check_interval === null && callback_check() !== true) {
						check_interval = setInterval(callback_check, check_interval_time);
					}
				}
			};

		})();

		$.prepend = function (parent, child) {
			return parent.insertBefore(child, parent.firstChild);
		};
		$.add = function (parent, child) {
			return parent.appendChild(child);
		};
		$.before = function (root, next, node) {
			return root.insertBefore(node, next);
		};
		$.after = function (root, prev, node) {
			return root.insertBefore(node, prev.nextSibling);
		};
		$.replace = function (root, elem) {
			return root.parentNode.replaceChild(elem, root);
		};
		$.remove = function (elem) {
			return elem.parentNode.removeChild(elem);
		};
		$.tnode = function (text) {
			return d.createTextNode(text);
		};
		$.node = function (tag, class_name, text) {
			var elem = d.createElement(tag);
			elem.className = class_name;
			if (text !== undefined) {
				elem.textContent = text;
			}
			return elem;
		};
		$.node_ns = function (namespace, tag, class_name) {
			var elem = d.createElementNS(namespace, tag);
			elem.setAttribute("class", class_name);
			return elem;
		};
		$.node_simple = function (tag) {
			return d.createElement(tag);
		};
		$.link = function (href, class_name, text) {
			var elem = d.createElement("a");
			if (href !== undefined) {
				elem.href = href;
				elem.target = "_blank";
				elem.rel = "noreferrer";
			}
			if (class_name !== undefined) {
				elem.className = class_name;
			}
			if (text !== undefined) {
				elem.textContent = text;
			}
			return elem;
		};
		$.on = function (elem, eventlist, handler) {
			var event, i, ii;
			if (eventlist instanceof Array) {
				for (i = 0, ii = eventlist.length; i < ii; ++i) {
					event = eventlist[i];
					elem.addEventListener(event[0], event[1], false);
				}
			}
			else {
				elem.addEventListener(eventlist, handler, false);
			}
		};
		$.off = function (elem, eventlist, handler) {
			var event, i, ii;
			if (eventlist instanceof Array) {
				for (i = 0, ii = eventlist.length; i < ii; ++i) {
					event = eventlist[i];
					elem.removeEventListener(event[0], event[1], false);
				}
			}
			else {
				elem.removeEventListener(eventlist, handler, false);
			}
		};
		$.test = function (elem, selector) {
			try {
				return elem.matches ? elem.matches(selector) : elem.matchesSelector(selector);
			}
			catch (e) {}
			return false;
		};

		$.clear = function (node) {
			node.innerHTML = "";
		};

		$.set_class = function (node, class_name, enabled) {
			if (node.classList.contains(class_name) !== enabled) {
				if (enabled) {
					node.classList.add(class_name);
				}
				else {
					node.classList.remove(class_name);
				}
			}
		};

		$.insert_styles = function (styles) {
			var head = d.head,
				n;
			if (head) {
				n = d.createElement("style");
				n.textContent = styles;
				head.appendChild(n);
			}
		};

		$.bind = function (fn, self) {
			if (arguments.length > 2) {
				var i = 0,
					ii = arguments.length - 2,
					args = new Array(ii);

				for (; i < ii; ++i) args[i] = arguments[i + 2];

				return function () {
					var full_args = args.slice(),
						i, ii;

					for (i = 0, ii = arguments.length; i < ii; ++i) {
						full_args.push(arguments[i]);
					}

					return fn.apply(self, full_args);
				};
			}
			else {
				return function () {
					return fn.apply(self, arguments);
				};
			}
		};

		var mouseenterleave_event_validate = function (self, parent) {
			try {
				for (; parent; parent = parent.parentNode) {
					if (parent === self) { return false; }
				}
				return true;
			}
			catch (e) {}
			return false;
		};
		$.wrap_mouseenterleave_event = function (fn) {
			return function (event) {
				return mouseenterleave_event_validate(this, event.relatedTarget) ? fn.call(this, event) : undefined;
			};
		};

		$.load_image = function (url, timeout, on_load_start, on_load, on_error) {
			if (typeof(on_load_start) !== "function") { on_load_start = null; }
			if (typeof(on_load) !== "function") { on_load = null; }
			if (typeof(on_error) !== "function") { on_error = null; }

			var image = document.createElement("img"),
				t1 = null,
				t2 = null,
				size = { width: 0, height: 0 },
				update_size, clear_timers, on_load_wrap, on_error_wrap;

			clear_timers = function () {
				if (t1 !== null) {
					clearInterval(t1);
					t1 = null;
				}
				if (t2 !== null) {
					clearTimeout(t2);
					t2 = null;
				}
			};

			update_size = function () {
				size.width = image.naturalWidth;
				size.height = image.naturalHeight;

				if (size.width === undefined || size.height === undefined) {
					size.width = image.width;
					size.height = image.height;
				}

				return !!(size.width || size.height);
			};

			on_load_wrap = function () {
				clear_timers();
				update_size();
				if (on_load_start !== null) {
					on_load_start.call(image, size);
					on_load_start = null;
				}
				on_load.call(image, size);
				$.off(image, "load", on_load_wrap);
				$.off(image, "error", on_error_wrap);
			};

			on_error_wrap = function (e) {
				clear_timers();
				if (on_error !== null) {
					on_error.call(image, e);
					on_error = null;
				}
				$.off(image, "load", on_load_wrap);
				$.off(image, "error", on_error_wrap);
				on_error_wrap = null;
			};

			t1 = setInterval(function () {
				if (update_size()) {
					t1 = null;
					clear_timers();
					if (on_load_start !== null) {
						on_load_start.call(image, size);
						on_load_start = null;
					}
				}
			}, 50);

			if (timeout && timeout > 0) {
				t2 = setTimeout(function () {
					on_error_wrap(null);
					image.removeAttribute("src");
				}, timeout);
			}

			$.on(image, "load", on_load_wrap);
			$.on(image, "error", on_error_wrap);
			image.src = url;

			return {
				image: image,
				cancel: function () {
					if (on_error_wrap !== null) {
						on_error_wrap(null);
					}
				}
			};
		};

		$.stop_transition = function (node/*, properties...*/) {
			node.style.transition = "none";
			//node.style.setProperty("transition", "none", "important");
			for (var i = 1; i < arguments.length; ++i) {
				window.getComputedStyle(node).getPropertyValue(arguments[i]);
			}
			node.style.transition = "";
		};

		return $;

	})();
	var $$ = function (selector, root) {
		return (root || document).querySelectorAll(selector);
	};

	var HttpRequest = (function () {

		var request;

		if ((function () {
			try {
				return (typeof(GM_xmlhttpRequest) === "function");
			}
			catch (e) {}
			return false;
		})()) {
			request = function (data) {
				return GM_xmlhttpRequest(data);
			};
		}
		else {
			// Fallback
			request = function (data) {
				var onerror = (data && data.onerror && typeof(data.onerror) === "function") ? data.onerror : null;
				if (onerror !== null) {
					setTimeout(function () {
						onerror.call(null, {});
					}, 1);
				}
			};
		}

		// Done
		return request;

	})();

	var EHentaiAPI = {};

	(function (EHentaiAPI) {

		var create_thumbnail_data = function (url, title, left, top, width, height) {
			return {
				url: url,
				title: title,
				left: left,
				top: top,
				width: width,
				height: height,
				gid: 0,
				page_token: "",
				page: 0
			};
		};

		var parse_title = function (text) {
			return text.replace(/^\s*page\s*\d+\s*:\s*/i, "");
		};
		var extend_page_info = function (url, data) {
			var m = /\/s\/([0-9a-zA-Z]+)\/(\d+)-(\d+)/.exec(url);
			if (m !== null) {
				data.gid = parseInt(m[2], 10);
				data.page_token = m[1];
				data.page = parseInt(m[3], 10);
			}
		};
		var parse_small = function (node) {
			var t, m1, m2, m3, n, data;

			if (
				(node = $("div", node)) !== null &&
				(t = node.getAttribute("style")) &&
				(m1 = /url\(['"]?([^'"\)]*)['"]?\)\s*-(\d+)px/.exec(t)) &&
				(m2 = /width\s*:\s*(\d+)px/.exec(t)) &&
				(m3 = /height\s*:\s*(\d+)px/.exec(t))
			) {
				n = $("img[title]", node);

				data = create_thumbnail_data(
					m1[1],
					(n === null) ? "" : parse_title(n.getAttribute("title")),
					parseInt(m1[2], 10),
					0,
					parseInt(m2[1], 10),
					parseInt(m3[1], 10)
				);

				if ((n = $("a[href]", node)) !== null) {
					extend_page_info(n.getAttribute("href"), data);
				}

				return data;
			}

			return create_thumbnail_data(null, "", 0, 0, -1, -1);
		};
		var parse_large = function (node) {
			var t, n, data;

			if ((n = $("img[src][title]", node)) !== null) {
				t = n.getAttribute("src");

				data = create_thumbnail_data(
					t,
					parse_title(n.getAttribute("title")),
					0, 0, -1, -1
				);

				if ((n = $("a[href]", node)) !== null) {
					extend_page_info(n.getAttribute("href"), data);
				}

				return data;
			}

			return create_thumbnail_data(null, "", 0, 0, -1, -1);
		};

		EHentaiAPI.gallery_thumbnails = {
			create_data: create_thumbnail_data,
			parse_small: parse_small,
			parse_large: parse_large
		};

	})(EHentaiAPI);

	(function (EHentaiAPI) {

		var labels = {
			k: 1024,
			m: 1024 * 1024,
			g: 1024 * 1024 * 1024,
			t: 1024 * 1024 * 1024 * 1024
		};
		var parse_labeled_number = function (text) {
			var m = /([\d\.]+)\s*(b|[kmgt]i?b)/i.exec(text),
				v;

			if (m === null || isNaN((v = parseFloat(m[1])))) {
				return undefined;
			}

			m = m[2][0].toLowerCase();
			if (Object.prototype.hasOwnProperty.call(labels, m)) {
				v *= labels[m];
			}
			return v;
		};

		var html_parse_safe = function (text, def) {
			try {
				return new DOMParser().parseFromString(text, "text/html");
			}
			catch (e) {}
			return def;
		};

		var create_empty_image_data = function () {
			return {
				page_url: null,
				gid: 0,
				token: null,
				page: 0,
				image_url: null,
				title: null,
				page_title: null,
				width: 0,
				height: 0,
				file_size: 0,
				page_count: 0,
				original: null,
				sha1: null,
				fallback: null,
				api: null
			};
		};
		var create_empty_original_data = function () {
			return {
				key: "",
				width: 0,
				height: 0,
				file_size: 0
			};
		};

		var get_api = function (html) {
			var any = false,
				data, ns, n, m, v, i, ii, re;

			data = {
				previous: null,
				next: null,
				key: null
			};

			if (
				(n = $("#prev", html)) !== null &&
				(v = get_single_quoted_string(n.getAttribute("onclick"))) !== null
			) {
				data.previous = v;
				any = true;
			}

			if (
				(n = $("#next", html)) !== null &&
				(v = get_single_quoted_string(n.getAttribute("onclick"))) !== null
			) {
				data.next = v;
				any = true;
			}

			re = /showkey="([^"]*)"/;
			ns = $$("script", html);
			for (i = 0, ii = ns.length; i < ii; ++i) {
				if ((m = re.exec(ns[i].textContent)) !== null) {
					data.key = m[1];
					any = true;
					break;
				}
			}

			return any ? data : null;
		};
		var get_single_quoted_string = function (text) {
			var m = /'([^']*)'/.exec(text);
			return (m === null) ? null : m[1];
		};
		var parse_page = function (html, url) {
			var data = create_empty_image_data(),
				d, n, m, i1, i2, t, v;

			data.page_url = url;

			// Image
			if ((n = $("#img", html)) !== null) {
				v = n.getAttribute("src");

				if (/\/509\.gif$/i.test(v)) {
					// Error
					return { error: "Image viewing limit exceeded" };
				}

				data.image_url = v;
			}


			// Title
			if ((n = $("h1", html)) !== null) {
				data.title = n.textContent;
			}

			// Page count
			if (
				(n = $("#i2>.sn>div", html)) !== null &&
				(m = /(\d+)\s*\/\s*(\d+)/.exec(n.textContent)) !== null
			) {
				data.page = parseInt(m[1], 10);
				data.page_count = parseInt(m[2], 10);
			}

			// Info
			if ((n = $("#i2>.sn+div", html)) !== null) {
				t = n.textContent;
				if (
					(i2 = t.lastIndexOf("::")) >= 0 &&
					(i1 = t.lastIndexOf("::", i2 - 2)) >= 0
				) {
					data.page_title = t.substr(0, i1).trim();
					data.file_size = Math.round(parse_labeled_number(t.substr(i2 + 2).trim()));
					if ((m = /(\d+)\s*x\s*(\d+)/.exec(t.substring(i1 + 2, i2))) !== null) {
						data.width = parseInt(m[1], 10);
						data.height = parseInt(m[2], 10);
					}
				}
			}

			// Return
			if (
				(n = $("#i5>.sb>a[href]", html)) !== null &&
				(m = /\/(\d+)\/([0-9a-fA-F]+)/.exec(n.getAttribute("href"))) !== null
			) {
				data.gid = parseInt(m[1], 10);
				data.token = m[2];
			}

			// Hash
			if (
				(n = $("#i6>a", html)) !== null &&
				(m = /f_shash=([^&]*)(?:&|$)/.exec(n.getAttribute("href"))) !== null
			) {
				data.sha1 = m[1];
			}

			// Fallback
			if (
				(n = $("#loadfail", html)) !== null &&
				(v = get_single_quoted_string(n.getAttribute("onclick"))) !== null
			) {
				data.fallback = v;
			}

			// Original
			if ((n = $("#i7>a", html)) !== null) {
				d = create_empty_original_data();
				data.original = d;

				t = n.textContent;
				if ((m = /(\d+)\s*x\s*(\d+)/.exec(t)) !== null) {
					d.width = parseInt(m[1], 10);
					d.height = parseInt(m[2], 10);
					t = t.substr(m.index + m[0].length);
				}

				t = t.replace(/\s*source$/i, "");
				if ((v = parse_labeled_number(t)) !== undefined) {
					d.file_size = Math.round(v);
				}

				if ((m = /key=([^&]*)(?:&|$)/.exec(n.getAttribute("href"))) !== null) {
					d.key = m[1];
				}
			}

			// API
			data.api = get_api(html);

			// Done
			return data;
		};

		var get_info = function (url, callback, on_progress) {
			var xhr_data = {
				method: "GET",
				url: url,
				onload: function (xhr) {
					if (xhr.status === 200) {
						var html = html_parse_safe(xhr.responseText, null),
							data;
						if (
							html !== null &&
							(data = parse_page(html, xhr.finalUrl)) !== null
						) {
							callback.call(null, null, data);
						}
						else {
							callback.call(null, "Invalid response", null);
						}
					}
					else {
						callback.call(null, "Invalid status", null);
					}
				},
				onerror: function () {
					callback.call(null, "Connection error", null);
				},
				onabort: function () {
					callback.call(null, "Connection aborted", null);
				}
			};

			if (typeof(on_progress) === "function") {
				xhr_data.onprogress = function (xhr) {
					on_progress.call(null, xhr.lengthComputable, xhr.loaded, xhr.total);
				};
			}

			return HttpRequest(xhr_data);
		};

		EHentaiAPI.gallery_page = {
			get_info: get_info
		};

	})(EHentaiAPI);

	var Previewer = (function () {

		var get_container = (function () {

			var container = null;

			return function () {
				if (!container) {
					container = $.node("div", "xp_preview_container");
					$.add(document.body, container);
				}
				return container;
			};

		})();

		var Previewer = function () {
			this.padding = {
				left: 0,
				top: 0,
				right: 0,
				bottom: 0
			};

			this.aspect_ratio = 1.0;
			this.initial_size = {
				width: 0.0,
				height: 0.0
			};

			this.size_node = null;
			this.minimize_callbacks = [];
			this.minimize_timer = null;

			this.on_window_resize = $.bind(on_window_resize, this);
			this.window_resize_listening = false;

			this.container = $.node("div", "xp_preview xp_preview_no_info");
			this.width_container = $.node("div", "xp_preview_width");
			this.height_container = $.node("div", "xp_preview_height");
			this.content = $.node("div", "xp_preview_content");
			this.thumbnail_container = $.node("div", "xp_preview_thumbnail_container");
			this.image_container = $.node("div", "xp_preview_image_container");

			this.info_container = $.node("div", "xp_preview_info_container");
			this.info = $.node("span", "xp_preview_info xp_background");
			this.title = $.node("span", "xp_preview_title", "");
			this.resolution_info = $.node("span", "xp_preview_resolution", "");

			$.add(this.container, this.width_container);
			$.add(this.width_container, this.info_container);
			$.add(this.info_container, this.info);
			$.add(this.info, this.title);
			$.add(this.info, this.resolution_info);
			$.add(this.width_container, this.height_container);
			$.add(this.height_container, this.content);
			$.add(this.content, this.thumbnail_container);
			$.add(this.content, this.image_container);
		};


		Previewer.prototype.set_image_data = function (image_data) {
			setup_image_content.call(this, image_data);
		};

		Previewer.prototype.open = function (size_node, thumbnail_data) {
			stop_minimize_timeout.call(this);

			this.size_node = size_node;

			try {
				$.add(get_container(), this.container);
			}
			catch (e) { return; }

			this.container.classList.add("xp_preview_visible");
			setup_title_content.call(this, thumbnail_data);

			var rect = size_node.getBoundingClientRect(),
				full_rect, inner_rect;

			this.initial_size.width = rect.width;
			this.initial_size.height = rect.height;
			this.aspect_ratio = this.initial_size.width / this.initial_size.height;

			setup_thumbnail_content.call(this, thumbnail_data);

			this.width_container.style.width = this.initial_size.width + "px";
			this.height_container.style.height = this.initial_size.height + "px";

			full_rect = this.container.getBoundingClientRect();
			inner_rect = this.height_container.getBoundingClientRect();
			this.padding.left = inner_rect.left - full_rect.left;
			this.padding.top = inner_rect.top - full_rect.top;
			this.padding.right = full_rect.width - inner_rect.width - this.padding.left;
			this.padding.bottom = full_rect.height - inner_rect.height - this.padding.top;

			update_position.call(this, rect.left - this.padding.left, rect.top - this.padding.top, this.is_fixed());
			update_scaling.call(this, rect.width, rect.height);

			set_container_scaling.call(this, this.thumbnail_container, true);
			set_container_scaling.call(this, this.image_container, true);

			stop_transition.call(this);
		};

		Previewer.prototype.close = function (callback) {
			var self = this;
			this.minimize(function () {
				self.destroy();
				if (typeof(callback) === "function") {
					callback.call(self);
				}
			});
			this.container.classList.add("xp_preview_closing");
		};

		Previewer.prototype.destroy = function () {
			if (this.container !== null) {
				this.container.classList.remove("xp_preview_visible");
				$.remove(this.container);
				this.container = null;
			}

			set_window_resize_listening.call(this, false);
			this.on_window_resize = null;
		};

		Previewer.prototype.is_fixed = function () {
			return this.container.classList.contains("xp_preview_fixed");
		};

		Previewer.prototype.set_fixed = function (fixed) {
			if (fixed !== this.is_fixed()) {
				var rect = this.container.getBoundingClientRect();
				if (fixed) {
					this.container.classList.add("xp_preview_fixed");
				}
				else {
					this.container.classList.remove("xp_preview_fixed");
				}
				update_position.call(this, rect.left, rect.top, fixed);
			}
		};

		Previewer.prototype.is_maximized = function () {
			return this.container.classList.contains("xp_preview_maximized");
		};

		Previewer.prototype.maximize = function () {
			if (this.minimize_timer !== null) {
				clearTimeout(this.minimize_timer);
				this.minimize_timer = null;
				this.minimize_callbacks = [];
			}

			set_window_resize_listening.call(this, true);

			this.set_fixed(true);
			stop_transition.call(this);
			this.container.classList.add("xp_preview_maximized");

			var win_width = (document.documentElement.clientWidth || window.innerWidth || 0),
				win_height = (document.documentElement.clientHeight || window.innerHeight || 0),
				region_width = win_width - this.padding.left - this.padding.right,
				region_height = win_height - this.padding.top - this.padding.bottom,
				w = region_width,
				h = region_height,
				s = (w / h) / (this.aspect_ratio);

			if (s > 1.0) {
				w = h * this.aspect_ratio;
			}
			else {
				h = w / this.aspect_ratio;
			}

			this.width_container.style.width = w + "px";
			this.height_container.style.height = h + "px";
			update_position.call(this, (region_width - w) * 0.5, (region_height - h) * 0.5, this.is_fixed());
			update_scaling.call(this, w, h);
		};

		Previewer.prototype.minimize = function (callback) {
			var is_max = this.is_maximized();

			if (typeof(callback) === "function") {
				if (this.minimize_timer !== null) {
					this.minimize_callbacks.push(callback);
				}
				else if (!is_max) {
					callback.call(this);
				}
			}

			if (!is_max) { return; }

			set_window_resize_listening.call(this, false);

			this.set_fixed(false);
			stop_transition.call(this);
			this.container.classList.remove("xp_preview_maximized");

			var rect = this.size_node.getBoundingClientRect();

			this.width_container.style.width = rect.width + "px";
			this.height_container.style.height = rect.height + "px";
			update_position.call(this, rect.left - this.padding.left, rect.top - this.padding.top, this.is_fixed());
			update_scaling.call(this, rect.width, rect.height);

			this.minimize_timer = setTimeout($.bind(on_minimize_complete, this), 0.25 * 1000);
		};


		var on_window_resize = function () {
			if (this.is_maximized()) {
				this.maximize();
			}
		};

		var set_window_resize_listening = function (listening) {
			if (this.window_resize_listening === listening || this.on_window_resize === null) { return; }

			this.window_resize_listening = listening;
			if (listening) {
				$.on(window, "resize", this.on_window_resize);
			}
			else {
				$.off(window, "resize", this.on_window_resize);
			}
		};


		var is_container_scaling = function (node) {
			return node.classList.contains("xp_preview_content_scaling");
		};

		var set_container_scaling = function (node, scaling) {
			$.set_class(node, "xp_preview_content_scaling", scaling);
			if (scaling) {
				node.style.width = this.initial_size.width + "px";
				node.style.height = this.initial_size.height + "px";
			}
			else {
				node.style.width = "";
				node.style.height = "";
			}
		};

		var update_position = function (x, y, is_fixed) {
			if (!is_fixed) {
				var doc_rect = document.documentElement.getBoundingClientRect();
				x -= doc_rect.left;
				y -= doc_rect.top;
			}
			this.container.style.transform = "translate(" + x + "px," + y +"px)";
			// this.container.style.left = x + "px";
			// this.container.style.top = y + "px";
		};

		var update_scaling = function (current_width, current_height) {
			var s = "scale(" + (current_width / this.initial_size.width) + "," + (current_height / this.initial_size.height) + ")";

			if (is_container_scaling(this.thumbnail_container)) {
				this.thumbnail_container.style.transform = s;
			}
			if (is_container_scaling(this.image_container)) {
				this.image_container.style.transform = s;
			}
		};

		var stop_transition = function () {
			$.stop_transition(this.container, "transform");
			$.stop_transition(this.width_container, "width");
			$.stop_transition(this.height_container, "height");
			$.stop_transition(this.thumbnail_container, "transform");
			$.stop_transition(this.image_container, "transform");
		};

		var stop_minimize_timeout = function () {
			if (this.minimize_timer !== null) {
				clearTimeout(this.minimize_timer);
				this.minimize_timer = null;
				this.minimize_callbacks = [];
			}
		};

		var on_minimize_complete = function () {
			var cbs = this.minimize_callbacks,
				i, ii;

			this.minimize_timer = null;
			this.minimize_callbacks = [];

			for (i = 0, ii = cbs.length; i < ii; ++i) {
				cbs[i].call(this);
			}
		};


		var setup_title_content = function (thumbnail_data) {
			if (thumbnail_data === null || !config.show_info) { return; }

			this.container.classList.remove("xp_preview_no_info");

			var s = "";
			if (thumbnail_data.page > 0) {
				s += "Page " + thumbnail_data.page + ": ";
			}
			s += thumbnail_data.title;
			this.title.textContent = s;
		};

		var setup_thumbnail_content = function (thumbnail_data) {
			if (thumbnail_data === null) { return; }

			$.clear(this.thumbnail_container);

			var n1;

			if (thumbnail_data.width > 0 && thumbnail_data.height > 0) {
				n1 = $.node("div", "xp_preview_thumbnail_small");

				n1.style.backgroundImage = "url('" + thumbnail_data.url + "')";
				n1.style.backgroundRepeat = "no-repeat";
				n1.style.backgroundPosition = "-" + thumbnail_data.left + "px -" + thumbnail_data.top + "px";

				$.add(this.thumbnail_container, n1);
			}
			else {
				n1 = $.node("img", "xp_preview_thumbnail_large");
				n1.src = thumbnail_data.url;

				$.add(this.thumbnail_container, n1);
			}
		};

		var setup_image_content = function (image_data) {
			if (image_data === null) { return; }

			$.clear(this.image_container);

			this.container.classList.remove("xp_preview_image_loading");
			this.container.classList.remove("xp_preview_image_loaded");

			if (config.show_info && config.show_full_info) {
				this.resolution_info.classList.add("xp_preview_resolution_visible");
				this.resolution_info.textContent = "(" + image_data.width + "x" + image_data.height + ")";
			}

			var self = this;
			var d = $.load_image(
				image_data.image_url,
				-1,
				function () {
					self.container.classList.add("xp_preview_image_loading");
				},
				function () {
					self.container.classList.remove("xp_preview_image_loading");
					self.container.classList.add("xp_preview_image_loaded");
				},
				function () {
					self.container.classList.remove("xp_preview_image_loading");
					self.container.classList.remove("xp_preview_image_loaded");
				});

			d.image.classList.add("xp_preview_image");
			$.add(this.image_container, d.image);
		};


		return Previewer;

	})();

	var Throttler = (function () {

		var Throttler = function (delay) {
			this.timer = null;
			this.delay = delay;
			this.entries = [];

			this.on_timer_end = $.bind(on_timer_end, this);
		};

		Throttler.prototype.add = function (callback) {
			if (this.timer === null) {
				run_callback.call(this, callback);
				return null;
			}

			var e = {
				callback: callback,
				complete: false
			};

			this.entries.push(e);

			return e;
		};

		Throttler.prototype.remove = function (entry) {
			if (entry !== null && typeof(entry) === "object" && !entry.complete) {
				for (var i = 0, ii = this.entries.length; i < ii; ++i) {
					if (this.entries[i] === entry) {
						entry.callback = null;
						entry.complete = true;
						this.entries.splice(i, 1);
						return true;
					}
				}
			}
			return false;
		};

		var run_callback = function (callback) {
			if (this.delay > 0) {
				this.timer = setTimeout(this.on_timer_end, this.delay * 1000);
			}
			if (typeof(callback) === "function") {
				callback.call(this);
			}
		};

		var on_timer_end = function () {
			this.timer = null;
			if (this.entries.length > 0) {
				var e = this.entries.shift(),
					cb = e.callback;
				e.complete = true;
				e.callback = null;
				run_callback.call(this, cb);
			}
		};

		return Throttler;

	})();

	var ThumbnailData = (function () {

		var ThumbnailData = function (image_container, is_small) {
			this.enabled = false;
			this.is_small = is_small;
			this.image_container = image_container;
			this.image_link = get_link(this.image_container);
			this.size_node = get_size_node(this.image_container, this.image_link, is_small);
			this.url = (this.image_link !== null ? this.image_link.href || "" : "");
			this.thumbnail = is_small ? EHentaiAPI.gallery_thumbnails.parse_small(this.image_container) : EHentaiAPI.gallery_thumbnails.parse_large(this.image_container);
			this.on_mouseover = $.wrap_mouseenterleave_event($.bind(on_image_mouseenter, this));
			this.on_mouseout = $.wrap_mouseenterleave_event($.bind(on_image_mouseleave, this));

			this.original_tooltip = null;
			this.preview = null;
			this.image_data = null;
			this.fetching_image_data = false;
			this.delay_timer = null;
			this.throttle_data = null;
		};


		ThumbnailData.prototype.set_enabled = function (enabled) {
			enabled = !!enabled;
			if (enabled === this.enabled) { return; }
			this.enabled = enabled;

			var n = config.hide_original_tooltip ? get_tooltip_node(this.image_container) : null;

			if (enabled) {
				if (n !== null) {
					if (this.original_tooltip === null) {
						this.original_tooltip = n.getAttribute("title") || null;
					}
					n.removeAttribute("title");
				}
				$.on(this.image_link, "mouseover", this.on_mouseover);
				$.on(this.image_link, "mouseout", this.on_mouseout);
			}
			else {
				if (n !== null) {
					if (this.original_tooltip !== null) {
						n.setAttribute("title", this.original_tooltip);
					}
				}
				$.off(this.image_link, "mouseover", this.on_mouseover);
				$.off(this.image_link, "mouseout", this.on_mouseout);
			}
		};


		var throttler = new Throttler(config.full_image_throttle);

		var get_link = function (image_container) {
			return $("a", image_container);
		};

		var get_size_node = function (image_container, image_link, is_small) {
			return $(is_small ? "div" : "img", image_container) || image_link;
		};

		var get_tooltip_node = function (image_container) {
			return $("img", image_container);
		};

		var on_image_mouseenter = function () {
			if (this.delay_timer !== null) { return; }

			if (config.open_delay > 0) {
				this.delay_timer = setTimeout($.bind(show_preview, this), config.open_delay * 1000);
			}
			else {
				show_preview.call(this);
			}

			//get_image_data.call(this);
		};

		var on_image_mouseleave = function () {
			if (this.delay_timer !== null) {
				clearTimeout(this.delay_timer);
				this.delay_timer = null;
			}
			if (this.preview !== null) {
				this.preview.close();
				this.preview = null;
			}

			throttler.remove(this.throttle_data);
			this.throttle_data = null;
		};

		var show_preview = function () {
			this.delay_timer = null;
			if (this.preview !== null) { return; }
			this.preview = new Previewer();
			this.preview.open(this.size_node, this.thumbnail);
			this.preview.maximize();
			get_image_data.call(this);
		};

		var get_image_data = function () {
			if (this.image_data !== null) {
				set_preview_data.call(this);
				return;
			}

			if (!config.show_full_image || this.fetching_image_data) { return; }

			var self = this;
			var cb = function () {
				if (self.fetching_image_data) { return; }
				self.fetching_image_data = true;

				// Fetch
				EHentaiAPI.gallery_page.get_info(self.url, function (err, data) {
					if (err === null && data !== null) {
						on_get_image_data.call(self, data);
					}
				});
			};

			throttler.remove(this.throttle_data);
			this.throttle_data = throttler.add(cb);
		};

		var on_get_image_data = function (data) {
			this.image_data = data;
			set_preview_data.call(this);
		};

		var set_preview_data = function () {
			if (this.preview !== null) {
				this.preview.set_image_data(this.image_data);
			}
		};

		return ThumbnailData;

	})();

	var main = (function () {

		var observe_changes = function (records) {
			var i, ii, r;
			for (i = 0, ii = records.length; i < ii; ++i) {
				r = records[i];
				check_nodes_for_images(r.addedNodes, images_added);
				check_nodes_for_images(r.removedNodes, images_removed);
			}
		};

		var check_nodes_for_images = function (nodes, action) {
			var i, ii, n;
			if (nodes && (ii = nodes.length) > 0) {
				for (i = 0; i < ii; ++i) {
					n = nodes[i];
					if (n.tagName !== undefined) {
						check_for_images(n, action);
					}
				}
			}
		};

		var check_for_images = function (root, action) {
			var images = $$(".gdtl", root);
			if (images.length > 0) {
				action(images, false);
			}
			images = $$(".gdtm", root);
			if (images.length > 0) {
				action(images, true);
			}
		};

		var images_added = function (images, is_small) {
			var i, ii, image;
			for (i = 0, ii = images.length; i < ii; ++i) {
				image = images[i];
				if (image !== null) {
					setup_image(image, is_small);
				}
			}
		};

		var images_removed = function (images) {
			var i, ii, image;
			for (i = 0, ii = images.length; i < ii; ++i) {
				image = images[i];
				if (image !== null) {
					cleanup_image(image);
				}
			}
		};

		var setup_image = function (image, is_small) {
			var data = image._xp_data;
			if (typeof(data) !== "object" || data === null) {
				data = new ThumbnailData(image, is_small);
				image._xp_data = data;
			}
			data.set_enabled(true);
		};

		var cleanup_image = function (image) {
			var data = image._xp_data;
			if (typeof(data) === "object" || data !== null) {
				data.set_enabled(false);
			}
		};

		var main = function () {
			$.insert_styles("#{style:../resources/stylesheets/style.css}#");

			if (main.is_exhentai) {
				document.documentElement.classList.add("xp_exhentai");
			}

			new MutationObserver(observe_changes).observe(document, { childList: true, subtree: true });
			check_for_images(document.documentElement, images_added);
		};

		main.is_exhentai = (("" + window.location.hostname).toLowerCase().indexOf("exhentai.org") >= 0);

		return main;

	})();

	$.ready(main);

})();

