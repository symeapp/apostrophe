// Apostrophe, lightweight name mentions for jQuery
// Version 0.1
// (c) Syme (git @ symeapp)
// Released under the MIT license

/*

# TODO

* select+delete and paste
* Mirror overflow (allows apostrophe to be used without an autogrow plugin)
* Selection popup

*/

(function($, _) {

  $.apostrophe = {};

  // Default config
  $.apostrophe.config = {

    // Handlers that trigger the update event (separated by spaces)
    eventHandlers: 'input',

    // After how many characters do we start considering a word as a
    // potential name?
    minimalLength: 3,

    // How close to a name should the levenshtein distance be
    // to be considered as a possibility?
    // From 0 to 2, 0 being exact maching and 2 being permissive.
    // NOTE: REQUIRES UNDERSCORE.JS STRING EXTENSIONS TO BE LOADED
    levenshtein: 1,

    // Computed textarea styles that have to be copied to the mirror.
    mirroredStyles: [
      'margin-top',     'margin-right',   'margin-bottom',  'margin-left',
      'padding-top',    'padding-right',  'padding-bottom', 'padding-left',
      'border-top',     'border-right',   'border-bottom',  'border-left',
      'font-family',    'font-size',      'font-weight',    'font-style',
      'letter-spacing', 'text-transform', 'word-spacing',   'text-indent',
      'line-height'
    ],

    // Verbose enum keycodes
    keycodes: {
      BACKSPACE:  8 , TAB:   9 ,  COMMA: 188,  SPACE:  32,
      RETURN:     13, ESC:   27,  LEFT:  37 ,  UP:     38,
      RIGHT:      39, DOWN:  40
    }

  };

  // jQuery function. Makes mirror and bind events.
  $.fn.apostrophe = function(config) {

    // Extend global config with config arguments
    var config = $.extend($.apostrophe.config, config || {});

    this
      // Keep only uninitialized textareas
      .filter('textarea')
      .filter(function(){ return !this.mirror })

      // Iterate on each
      .each(function(){

        // Shortcuts to DOM and jQuery versions of textarea
        var el = this, $el = $(this);

        // Get textarea position and dimensions
        var posAndDims = {
          top:    $el.offset().top, left:   $el.offset().left,
          width:  $el.outerWidth(), height: $el.outerHeight()
        }

        // Merge them with the computed styles that matter
        var style = $.extend(posAndDims,
          $.apostrophe.getStyles(el, config.mirroredStyles));

        // Create mirror, style it and append it to body
        var $mirror = $('<div class="apostrophe-mirror" />')
          .css(style).appendTo('body');

        // Initialize element DOM properties
        el.mentionned = [];
        el.charCount  = el.value.length;
        el.config     = config;
        el.mirror     = $mirror.get(0);

        // Bind events
        $el
          .on(config.eventHandlers, $.apostrophe.update)
          .on('apostrophe.destroy', function(){
            $el
              .off(config.eventHandlers, $.apostrophe.update)
              .removeProp('mirror');
            $mirror.remove();
          });

      });

    // Chainability
    return this;

  };

  // Update mirror and check for mentionned names.
  $.apostrophe.update = function(e) {

    var _this       = this,
        config      = this.config,
        charIndex   = this.selectionStart <= 0 ? 0 : this.selectionStart,
        charDiff    = this.value.length - this.charCount;

    // Update charCount counter now that we now charDiff
    this.charCount = this.value.length;

    // Has a mention been severed?
    var overlapping = _.find(this.mentionned, function(person){
      return charIndex > person.pos + 1 &&
        charIndex < person.pos + person.name.length;
    });

    // If it is, remove the mention.
    if (overlapping) {

      // Pass the mentionned name from the names to the people list
      this.config.people.push(overlapping);
      this.mentionned = _.reject(this.mentionned, function(person){
        return person.name == overlapping.name;
      });

    } else {

      // If no mention has been severed, push the next positions.
      var furtherPeople = _.filter(this.mentionned, function(person){
        return person.pos >= charIndex - 1 ;
      });
      _.each(furtherPeople, function(person){ person.pos = person.pos + charDiff; });

    }

    // Check if any name has been inputted
    $.apostrophe.checkForNames.call(_this, charIndex);

    // Add the highlight tags in the mirror copy
    var formatted_content = this.value;
    _.each(_.flatten(_.indexBy(this.mentionned, 'pos')), function(person, i) {

      // 7 characters are added by "<b></b>". We add them linearly
      // following the sorted mentions index order, thus: i * 7
      var nameIndex = person.pos + i * 7;

      formatted_content = [
        formatted_content.slice(0, nameIndex),
        '<b>' + person.name + '</b>',
        formatted_content.slice(nameIndex + person.name.length)
      ].join('');

    });

    // Push HTML-linebreaked content to the mirror
    this.mirror.innerHTML = formatted_content.replace(/\n/g, "<br/>");

  };

  $.apostrophe.checkForNames = function(charIndex){

    var config = this.config;

    // Get current word with enclosing text at caret position
    var parts = $.apostrophe.getParts(this.value, charIndex);

    // Does the current word look like a name?
    var looksLikeName = /^[A-Z]/.test(parts.word) &&
      parts.word.length >= config.minimalLength;

    // Are there names that ressemble it?
    var potentialPeople = _.filter(config.people, function(person){
      return _.any(person.name.split(' '), function(partOfName){

        var isMatch       = (new RegExp('^' + parts.word)).test(partOfName),
            isLevenshtein = _.isObject(_.str) ?
              _.str.levenshtein(parts.word, partOfName) <= config.levenshtein :
              false;

        return isMatch || isLevenshtein;

      });
    });

    // If there are resembling names, trigger dropdown.
    // DEVELOPMENT: AUTOMATICALLY PUT FIRST RESULT
    return looksLikeName && potentialPeople.length ?
      $.apostrophe.placeName.call(this, potentialPeople[0], parts.before, parts.after) :
      false;

  };

  $.apostrophe.placeName = function (selectedPerson, before, after) {

    // if(typeof first !== "undefined") return; first = true;

    // Update textarea with selected name
    this.value = before + selectedPerson.name + after;

    // Pass the mentionned name from the names to the mentionned list
    this.mentionned.push( _.extend(selectedPerson, { pos: before.length }) );
    this.config.people = _.reject(this.config.people, function(person){
      return person.name == selectedPerson.name;
    });

    // Place the text caret after the mentionned name
    var newCaretPos = before.length + selectedPerson.name.length;
    this.setSelectionRange(newCaretPos, newCaretPos);

    return true;

  };

  // Given a string 'content', and an index in it 'charIndex',
  // Will return the current word, the string before it, and
  // the string after it.
  $.apostrophe.getParts = function(content, charIndex) {

    var before  = content.substr(0, charIndex),
        after   = content.substr(charIndex);

    var leftPart = '', rightPart = '';

    for (var i = before.length - 1; i > 0; i--) {
      if (/\s/g.test(before[i])) {
        before = before.slice(0, i + 1); break;
      } else leftPart = before[i] + leftPart;
    }

    for (var j = 0; j < after.length; j++) {
      if (/\s/g.test(after[j])) {
        after = after.slice(j, after.length); break;
      } else rightPart += after[j];
    }

    return {
      word: leftPart + rightPart,
      before: before,
      after: after
    };

  };

  // Polyfill helper to get computed styles
  // 'el' should be a DOM element, and 'props' an array of
  // CSS properties or a string of a single property .
  $.apostrophe.getStyles = function (el, props) {

    var results = {};
    if (typeof props === "string") props = [props];

    $.each(props, function(i, prop) {
      if (el.currentStyle)
        results[prop] = el.currentStyle[prop];
      else if (window.getComputedStyle)
        results[prop] = document.defaultView
          .getComputedStyle(el, null)
          .getPropertyValue(prop);
    });

    return results;

  }

})(jQuery, _);