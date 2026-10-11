
(() => {
  "use strict";

  // Frontend and FastAPI run on the same server.
  const API_BASE = window.location.origin;

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");

  const errorLabelEl = document.getElementById("error-label");
  const errorCopyEl = document.getElementById("error-copy");

  const stressGroup = document.getElementById("stress_level_group");
  const stressInput = document.getElementById("stress_level");

  const GAUGE_ARC_LENGTH = 314;

  if (!form || !submitBtn) {
    console.error("Missing predict-form or submit-btn in index.html.");
    return;
  }

  // --------------------------------------------------
  // Show exactly one UI state at a time
  // --------------------------------------------------

  function showState(state) {
    const validStates = ["idle", "loading", "result", "error"];

    validStates.forEach((name) => {
      const element = document.getElementById(`state-${name}`);

      if (element) {
        element.hidden = true;
        element.style.display = "none";
      }
    });

    if (!validStates.includes(state)) {
      console.error("Unknown UI state:", state);
      return;
    }

    const selected = document.getElementById(`state-${state}`);

    if (selected) {
      selected.hidden = false;
      selected.style.display = "";
    }
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function renderError(title, message) {
    console.error("Prediction error:", title, message);

    if (errorLabelEl) {
      errorLabelEl.textContent = title;
    }

    if (errorCopyEl) {
      errorCopyEl.textContent = message;
    }

    showState("error");
  }

  // --------------------------------------------------
  // Form validation helpers
  // --------------------------------------------------

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((field) => {
      field.classList.remove("field-error");
    });

    form.querySelectorAll(".error-msg").forEach((element) => {
      element.textContent = "";
    });
  }

  function setFieldError(input, message) {
    if (!input) return;

    const wrapper = input.closest(".field");
    if (!wrapper) return;

    wrapper.classList.add("field-error");

    const errorElement = wrapper.querySelector(".error-msg");

    if (errorElement) {
      errorElement.textContent = message;
    }
  }

  function clearFieldError(input) {
    if (!input) return;

    const wrapper = input.closest(".field");
    if (!wrapper) return;

    wrapper.classList.remove("field-error");

    const errorElement = wrapper.querySelector(".error-msg");

    if (errorElement) {
      errorElement.textContent = "";
    }
  }

  // --------------------------------------------------
  // Stress-level buttons
  // --------------------------------------------------

  function setStressLevel(value) {
    if (!stressGroup || !stressInput) return;

    stressInput.value = value;

    stressGroup.querySelectorAll(".seg-btn").forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.value === value
      );
    });

    clearFieldError(stressInput);
  }

  if (stressGroup && stressInput) {
    stressGroup.querySelectorAll(".seg-btn").forEach((button) => {
      button.addEventListener("click", () => {
        setStressLevel(button.dataset.value || "");
      });
    });

    // Keep the selected button consistent with the hidden input.
    setStressLevel(stressInput.value || "Medium");
  }

  // --------------------------------------------------
  // Collect form data
  // --------------------------------------------------

  function collectPayload() {
    const fd = new FormData(form);

    function numberValue(name) {
      const value = fd.get(name);

      if (value === null || String(value).trim() === "") {
        return NaN;
      }

      return Number(value);
    }

    return {
      age: numberValue("age"),
      gender: fd.get("gender") || "",
      country: String(fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: numberValue(
        "avg_daily_usage_hours"
      ),
      daily_unlocks: numberValue("daily_unlocks"),
      study_hours: numberValue("study_hours"),
      physical_activity_hours: numberValue(
        "physical_activity_hours"
      ),
      sleep_hours_per_night: numberValue(
        "sleep_hours_per_night"
      ),
      stress_level: fd.get("stress_level") || ""
    };
  }

  // --------------------------------------------------
  // Validate form inputs
  // --------------------------------------------------

  function validate(payload) {
    const errors = [];

    const numericRules = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24]
    ];

    numericRules.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const value = payload[key];

      if (!Number.isFinite(value)) {
        errors.push([input, "Enter a valid number."]);
      } else if (
        value < min ||
        value > max ||
        (key === "age" && !Number.isInteger(value)) ||
        (key === "daily_unlocks" && !Number.isInteger(value))
      ) {
        errors.push([
          input,
          `Enter a valid value between ${min} and ${
            max === Infinity ? "unlimited" : max
          }.`
        ]);
      }
    });

    [
      "gender",
      "country",
      "academic_level",
      "most_used_platform",
      "purpose_of_use"
    ].forEach((key) => {
      const input = document.getElementById(key);

      if (!payload[key] || !String(payload[key]).trim()) {
        errors.push([input, "This field is required."]);
      }
    });

    const allowedStressLevels = [
      "Low",
      "Medium",
      "High",
      "Very High"
    ];

    if (!allowedStressLevels.includes(payload.stress_level)) {
      errors.push([stressInput, "Select a stress level."]);
    }

    return errors;
  }

  // --------------------------------------------------
  // Score description
  // --------------------------------------------------

  function bandFor(score) {
    if (score < 4) {
      return {
        label: "Signal: strained",
        context:
          "Your responses indicate a lower predicted score. " +
          "This result is not a mental health diagnosis."
      };
    }

    if (score < 7) {
      return {
        label: "Signal: balanced",
        context:
          "Your model-predicted score is in the middle range. " +
          "This result is not a mental health diagnosis."
      };
    }

    return {
      label: "Signal: strong",
      context:
        "Your model-predicted score is in the higher range. " +
        "This result is not a mental health diagnosis."
    };
  }

  // --------------------------------------------------
  // Render a successful prediction
  // --------------------------------------------------

  function renderResult(score) {
    const numericScore = Number(score);

    if (!Number.isFinite(numericScore)) {
      renderError(
        "Invalid API response",
        "The server did not return a valid prediction score."
      );
      return;
    }

    const clamped = Math.max(0, Math.min(10, numericScore));
    const band = bandFor(clamped);

    if (scoreNumberEl) {
      scoreNumberEl.textContent = clamped.toFixed(2);
    }

    if (scoreBandEl) {
      scoreBandEl.textContent = band.label;
    }

    if (scoreContextEl) {
      scoreContextEl.textContent = band.context;
    }

    // IMPORTANT: update the gauge inside the result panel.
    const resultGaugeFill =
      document.getElementById("result-gauge-fill");

    if (resultGaugeFill) {
      resultGaugeFill.style.transition = "none";
      resultGaugeFill.style.strokeDashoffset =
        String(GAUGE_ARC_LENGTH);

      requestAnimationFrame(() => {
        resultGaugeFill.style.transition = "";
        resultGaugeFill.style.strokeDashoffset = String(
          GAUGE_ARC_LENGTH * (1 - clamped / 10)
        );
      });
    }

    // Only the result panel should be visible after success.
    showState("result");
  }

  // --------------------------------------------------
  // Display validation errors returned by FastAPI
  // --------------------------------------------------

  function applyServerValidationErrors(details) {
    if (!Array.isArray(details)) return false;

    let matched = false;

    details.forEach((error) => {
      const field = Array.isArray(error.loc)
        ? error.loc[error.loc.length - 1]
        : null;

      const input =
        field === "stress_level"
          ? stressInput
          : document.getElementById(field);

      if (input) {
        setFieldError(input, error.msg || "Invalid value.");
        matched = true;
      }
    });

    return matched;
  }

  // --------------------------------------------------
  // Submit prediction
  // --------------------------------------------------

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const errors = validate(payload);

    if (errors.length > 0) {
      errors.forEach(([input, message]) => {
        setFieldError(input, message);
      });

      showState("idle");
      errors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    showState("loading");

    try {
      console.log("Sending prediction request:", payload);

      const response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = await response.json().catch(() => null);

      console.log("API status:", response.status);
      console.log("API response:", body);

      if (!response.ok) {
        if (response.status === 422 && body?.detail) {
          const matched = applyServerValidationErrors(
            body.detail
          );

          renderError(
            "Check your inputs",
            matched
              ? "Correct the highlighted fields and submit again."
              : JSON.stringify(body.detail)
          );
        } else {
          const detail = body?.detail;

          const message =
            typeof detail === "string"
              ? detail
              : JSON.stringify(
                  detail || "The server returned no error details."
                );

          renderError(
            `Prediction failed (${response.status})`,
            message
          );
        }

        return;
      }

      const score = body?.predicted_mental_health_score;

      if (
        typeof score !== "number" ||
        !Number.isFinite(score)
      ) {
        renderError(
          "Invalid API response",
          "The server response does not contain a valid predicted_mental_health_score."
        );
        return;
      }

      // Success: show the score, not the error panel.
      renderResult(score);

    } catch (error) {
      console.error("Network or JavaScript error:", error);

      renderError(
        "Cannot reach the server",
        `${error.message}. Check that FastAPI is running at ${API_BASE}.`
      );

    } finally {
      setSubmitting(false);
    }
  });

  // --------------------------------------------------
  // Clear field errors when the user edits a field
  // --------------------------------------------------

  form.querySelectorAll("input, select").forEach((element) => {
    element.addEventListener("input", () => {
      clearFieldError(element);
    });

    element.addEventListener("change", () => {
      clearFieldError(element);
    });
  });

  // --------------------------------------------------
  // Reset and retry buttons
  // --------------------------------------------------

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearAllErrors();
      form.reset();

      // Restore the default stress selection.
      setStressLevel("Medium");

      // Reset the result gauge for the next prediction.
      const resultGaugeFill =
        document.getElementById("result-gauge-fill");

      if (resultGaugeFill) {
        resultGaugeFill.style.transition = "none";
        resultGaugeFill.style.strokeDashoffset =
          String(GAUGE_ARC_LENGTH);
      }

      showState("idle");
    });
  }

  if (errorRetryBtn) {
    errorRetryBtn.addEventListener("click", () => {
      clearAllErrors();
      showState("idle");
    });
  }

  // --------------------------------------------------
  // Draw tick marks on both gauges
  // --------------------------------------------------

  document.querySelectorAll(".gauge-ticks").forEach((group) => {
    group.innerHTML = "";

    const cx = 120;
    const cy = 140;
    const outerRadius = 100;
    const innerRadius = 90;

    for (let i = 0; i <= 10; i += 2) {
      const angle = Math.PI - (i / 10) * Math.PI;

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );

      line.setAttribute(
        "x1",
        (cx + outerRadius * Math.cos(angle)).toFixed(1)
      );

      line.setAttribute(
        "y1",
        (cy - outerRadius * Math.sin(angle)).toFixed(1)
      );

      line.setAttribute(
        "x2",
        (cx + innerRadius * Math.cos(angle)).toFixed(1)
      );

      line.setAttribute(
        "y2",
        (cy - innerRadius * Math.sin(angle)).toFixed(1)
      );

      group.appendChild(line);
    }
  });

  // Initial page state.
  showState("idle");

})();
