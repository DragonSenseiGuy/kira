<template>
  <div class="ui-slider-field">
    <div v-if="label" class="ui-slider-field__head">
      <span class="ui-slider-field__label">{{ label }}</span>
      <span class="ui-slider-field__value">{{ displayValue }}</span>
    </div>
    <SliderRoot
      class="ui-slider"
      :model-value="[modelValue]"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @update:model-value="$emit('update:modelValue', $event[0])"
    >
      <SliderTrack class="ui-slider__track">
        <SliderRange class="ui-slider__range" />
      </SliderTrack>
      <SliderThumb class="ui-slider__thumb" :aria-label="label || ariaLabel" />
    </SliderRoot>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { SliderRoot, SliderTrack, SliderRange, SliderThumb } from "reka-ui";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  step: { type: Number, default: 0.01 },
  label: { type: String, default: "" },
  ariaLabel: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  /** Decimal places for the readout. Tabular figures keep it from jittering. */
  precision: { type: Number, default: 2 },
});

defineEmits(["update:modelValue"]);

const displayValue = computed(() =>
  Number.isInteger(props.step) ? String(props.modelValue) : props.modelValue.toFixed(props.precision),
);
</script>

<style scoped>
.ui-slider-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ui-slider-field__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.ui-slider-field__label {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.ui-slider-field__value {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.ui-slider {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 20px;
  touch-action: none;
  user-select: none;
}

.ui-slider__track {
  position: relative;
  flex-grow: 1;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--line-strong);
}

.ui-slider__range {
  position: absolute;
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent);
}

.ui-slider__thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--card);
  box-shadow: 0 0 0 1px var(--line-strong), 0 1px 3px #00000024;
  cursor: grab;
  transition:
    box-shadow var(--duration-fast) var(--ease-out),
    transform var(--duration-fast) var(--ease-out-strong);
}

.ui-slider__thumb:hover {
  transform: scale(1.1);
}

.ui-slider__thumb:active {
  cursor: grabbing;
  transform: scale(1.05);
}

.ui-slider__thumb:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent), 0 0 0 4px var(--focus-ring);
}
</style>
