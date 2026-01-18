import Sortable from "sortablejs";

export function createTimelineManager({
  timelineEl,
  settings,
  getSlides,
  setSlides,
  getCurrentIndex,
  setCurrentIndex,
  setCurrentSlide,
  markInteraction,
  refreshSlide,
  applySlideOverrides,
  getSlideDuration,
  getSlideTransition,
  createSlideOverrides,
  ensureSlideId,
  updateNextAuto,
  scheduleDraftSave,
}){
  if(!timelineEl){
    return {
      render: () => {},
      updateActive: () => {},
    };
  }

  let sortable = null;

  function createLabeledInput(labelText, inputEl){
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("label");
    label.textContent = labelText;
    const ctl = document.createElement("div");
    ctl.className = "ctl";
    ctl.appendChild(inputEl);
    row.append(label, ctl);
    return row;
  }

  function updateActive(){
    const cards = timelineEl.querySelectorAll(".timeline-card");
    const currentIndex = getCurrentIndex();
    cards.forEach((card, index) => {
      card.classList.toggle("active", index === currentIndex);
    });
  }

  function render(){
    timelineEl.innerHTML = "";
    const slides = getSlides();
    slides.forEach((slide, index) => {
      ensureSlideId(slide);
      const card = document.createElement("div");
      card.className = "timeline-card";
      if(index === getCurrentIndex()) card.classList.add("active");

      const header = document.createElement("div");
      header.className = "timeline-header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "timeline-title";
      const title = document.createElement("div");
      title.textContent = slide.type === "text" ? slide.title || "Text slide" : slide.name || "Media";
      const meta = document.createElement("span");
      meta.textContent = slide.type.toUpperCase();
      titleWrap.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "timeline-actions";

      const dragHandle = document.createElement("button");
      dragHandle.className = "btn tiny timeline-handle";
      dragHandle.type = "button";
      dragHandle.textContent = "↕";
      dragHandle.title = "Drag to reorder";

      const btnSelect = document.createElement("button");
      btnSelect.className = "btn tiny";
      btnSelect.textContent = "Select";
      btnSelect.addEventListener("click", () => {
        setCurrentSlide(index);
      });

      const btnUp = document.createElement("button");
      btnUp.className = "btn tiny";
      btnUp.textContent = "↑";
      btnUp.disabled = index === 0;
      btnUp.addEventListener("click", () => {
        if(index === 0) return;
        const list = getSlides();
        const tmp = list[index - 1];
        list[index - 1] = list[index];
        list[index] = tmp;
        if(getCurrentIndex() === index) setCurrentIndex(index - 1);
        else if(getCurrentIndex() === index - 1) setCurrentIndex(index + 1);
        setSlides(list);
        render();
        scheduleDraftSave?.();
        markInteraction();
      });

      const btnDown = document.createElement("button");
      btnDown.className = "btn tiny";
      btnDown.textContent = "↓";
      btnDown.disabled = index === slides.length - 1;
      btnDown.addEventListener("click", () => {
        if(index >= slides.length - 1) return;
        const list = getSlides();
        const tmp = list[index + 1];
        list[index + 1] = list[index];
        list[index] = tmp;
        if(getCurrentIndex() === index) setCurrentIndex(index + 1);
        else if(getCurrentIndex() === index + 1) setCurrentIndex(index - 1);
        setSlides(list);
        render();
        scheduleDraftSave?.();
        markInteraction();
      });

      const btnDelete = document.createElement("button");
      btnDelete.className = "btn tiny";
      btnDelete.textContent = "✕";
      btnDelete.disabled = slides.length <= 1;
      btnDelete.addEventListener("click", () => {
        const list = getSlides();
        if(list.length <= 1) return;
        list.splice(index, 1);
        if(getCurrentIndex() >= list.length) setCurrentIndex(list.length - 1);
        setSlides(list);
        render();
        setCurrentSlide(getCurrentIndex());
        scheduleDraftSave?.();
        markInteraction();
      });

      actions.append(dragHandle, btnSelect, btnUp, btnDown, btnDelete);
      header.append(titleWrap, actions);

      const settingsWrap = document.createElement("div");
      settingsWrap.className = "timeline-settings";
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "Slide settings";
      details.appendChild(summary);

      const useGlobal = document.createElement("input");
      useGlobal.type = "checkbox";
      useGlobal.checked = !slide.overrides;
      const useGlobalRow = createLabeledInput("Use global settings", useGlobal);
      details.appendChild(useGlobalRow);

      const durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.min = "2";
      durationInput.max = "60";
      durationInput.step = "0.5";
      durationInput.value = String(slide.duration ?? settings.interval);
      durationInput.addEventListener("change", () => {
        slide.duration = getSlideDuration({ duration: durationInput.value });
        durationInput.value = String(slide.duration);
        updateNextAuto(slide, index);
        scheduleDraftSave?.();
        markInteraction();
      });
      details.appendChild(createLabeledInput("Duration (sec)", durationInput));

      const transitionInput = document.createElement("input");
      transitionInput.type = "number";
      transitionInput.min = "0.6";
      transitionInput.max = "10";
      transitionInput.step = "0.1";
      transitionInput.value = String(slide.transition ?? settings.transition);
      transitionInput.addEventListener("change", () => {
        slide.transition = getSlideTransition({ transition: transitionInput.value });
        transitionInput.value = String(slide.transition);
        scheduleDraftSave?.();
        markInteraction();
      });
      details.appendChild(createLabeledInput("Transition (sec)", transitionInput));

      const controlFields = [
        { key: "dotSize", label: "Particle size", type: "range", min: 0.6, max: 50, step: 0.1 },
        { key: "softness", label: "Sharpness", type: "range", min: 0.02, max: 0.35, step: 0.01 },
        { key: "threshold", label: "Threshold", type: "range", min: 0.05, max: 0.95, step: 0.01 },
        { key: "ditherStrength", label: "Dither strength", type: "range", min: 0, max: 1, step: 0.01 },
        { key: "brightness", label: "Brightness", type: "range", min: -0.5, max: 0.5, step: 0.01 },
        { key: "contrast", label: "Contrast", type: "range", min: 0.5, max: 2, step: 0.01 },
        { key: "saturation", label: "Saturation", type: "range", min: 0, max: 2, step: 0.01 },
        { key: "gamma", label: "Gamma", type: "range", min: 0.5, max: 2.5, step: 0.01 },
        { key: "swirl", label: "Swirl", type: "range", min: 0, max: 6, step: 0.1 },
        { key: "jitter", label: "Jitter", type: "range", min: 0, max: 2.5, step: 0.05 },
        { key: "oscAmplitude", label: "Osc amplitude", type: "range", min: 0, max: 6, step: 0.05 },
        { key: "oscFrequency", label: "Osc frequency", type: "range", min: 0.5, max: 12, step: 0.1 },
        { key: "oscSpeed", label: "Osc speed", type: "range", min: 0, max: 6, step: 0.05 },
      ];

      const selects = [
        {
          key: "shape",
          label: "Shape",
          options: [
            { value: "dot", label: "Dot" },
            { value: "square", label: "Square" },
            { value: "diamond", label: "Diamond" },
            { value: "pixel", label: "Pixel" },
          ],
        },
        {
          key: "animEffect",
          label: "Animation effect",
          options: [
            { value: "all", label: "All" },
            { value: "swirl", label: "Swirl" },
            { value: "jitter", label: "Jitter" },
            { value: "oscillation", label: "Oscillation" },
            { value: "none", label: "None" },
          ],
        },
        {
          key: "mode",
          label: "Sampling mode",
          options: [
            { value: "auto", label: "Auto" },
            { value: "silhouette", label: "Silhouette" },
            { value: "edges", label: "Edges" },
            { value: "full", label: "Full image" },
            { value: "grid", label: "Grid halftone" },
          ],
        },
        {
          key: "dither",
          label: "Dither",
          options: [
            { value: "none", label: "None" },
            { value: "bayer2", label: "Bayer 2×2" },
            { value: "bayer4", label: "Bayer 4×4" },
            { value: "random", label: "Random" },
          ],
        },
        {
          key: "blend",
          label: "Blending",
          options: [
            { value: "add", label: "Additive" },
            { value: "normal", label: "Normal" },
          ],
        },
        {
          key: "oscMode",
          label: "Oscillation",
          options: [
            { value: "none", label: "None" },
            { value: "grid", label: "Grid" },
            { value: "radial", label: "Radial" },
          ],
        },
      ];

      const controlInputs = [];
      const syncControlValues = () => {
        const source = slide.overrides ?? settings;
        controlInputs.forEach(({ input, key }) => {
          input.value = String(source[key]);
        });
      };

      controlFields.forEach((field) => {
        const input = document.createElement("input");
        input.type = field.type;
        input.min = String(field.min);
        input.max = String(field.max);
        input.step = String(field.step);
        input.value = String((slide.overrides ?? settings)[field.key]);
        input.addEventListener("input", () => {
          if(!slide.overrides) return;
          slide.overrides[field.key] = parseFloat(input.value);
          if(index === getCurrentIndex()){
            applySlideOverrides(slide);
            refreshSlide(true);
          }
          scheduleDraftSave?.();
          markInteraction();
        });
        controlInputs.push({ input, key: field.key });
        details.appendChild(createLabeledInput(field.label, input));
      });

      selects.forEach((field) => {
        const select = document.createElement("select");
        field.options.forEach((opt) => {
          const option = document.createElement("option");
          option.value = opt.value;
          option.textContent = opt.label;
          select.appendChild(option);
        });
        select.value = (slide.overrides ?? settings)[field.key];
        select.addEventListener("change", () => {
          if(!slide.overrides) return;
          slide.overrides[field.key] = select.value;
          if(index === getCurrentIndex()){
            applySlideOverrides(slide);
            refreshSlide(true);
          }
          scheduleDraftSave?.();
          markInteraction();
        });
        controlInputs.push({ input: select, key: field.key });
        details.appendChild(createLabeledInput(field.label, select));
      });

      const disableControls = (disabled) => {
        controlInputs.forEach(({ input }) => {
          input.disabled = disabled;
        });
      };
      disableControls(!slide.overrides);

      useGlobal.addEventListener("change", () => {
        slide.overrides = useGlobal.checked ? null : createSlideOverrides();
        syncControlValues();
        disableControls(useGlobal.checked);
        if(index === getCurrentIndex()){
          applySlideOverrides(slide);
          refreshSlide(true);
        }
        scheduleDraftSave?.();
        markInteraction();
      });

      settingsWrap.appendChild(details);
      card.append(header, settingsWrap);
      timelineEl.appendChild(card);
    });

    if(!sortable){
      sortable = new Sortable(timelineEl, {
        animation: 150,
        handle: ".timeline-handle",
        onEnd: (evt) => {
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;
          if(oldIndex == null || newIndex == null || oldIndex === newIndex) return;
          const list = getSlides();
          const [moved] = list.splice(oldIndex, 1);
          list.splice(newIndex, 0, moved);
          const currentIndex = getCurrentIndex();
          let nextIndex = currentIndex;
          if(currentIndex === oldIndex){
            nextIndex = newIndex;
          } else if(currentIndex > oldIndex && currentIndex <= newIndex){
            nextIndex = currentIndex - 1;
          } else if(currentIndex < oldIndex && currentIndex >= newIndex){
            nextIndex = currentIndex + 1;
          }
          setCurrentIndex(nextIndex);
          setSlides(list);
          render();
          updateNextAuto(list[nextIndex], nextIndex);
          scheduleDraftSave?.();
          markInteraction();
        },
      });
    }
  }

  return {
    render,
    updateActive,
  };
}
