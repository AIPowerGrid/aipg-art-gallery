import React, { useState, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

function SliderWithCounter({
  min,
  max,
  step = 1,
  defaultValue,
  value,
  onValueChange,
}: any) {
  // Initialize with the value prop or defaultValue or a safe fallback
  const initialValue = Array.isArray(value) 
    ? value[0]
    : typeof value === 'number' 
      ? value 
      : defaultValue && !isNaN(defaultValue) 
        ? defaultValue 
        : min;

  const [sliderValue, setSliderValue] = useState(initialValue);

  // Update sliderValue when value prop changes
  useEffect(() => {
    const newValue = Array.isArray(value) 
      ? value[0] 
      : typeof value === 'number' 
        ? value 
        : undefined;
    
    if (newValue !== undefined && !isNaN(newValue)) {
      setSliderValue(newValue);
    }
  }, [value]);

  const handleChange = (newValue: any) => {
    if (!Array.isArray(newValue) && typeof newValue !== 'number') return;
    
    const actualValue = Array.isArray(newValue) ? newValue[0] : newValue;
    
    if (isNaN(actualValue)) {
      console.error("SliderWithCounter received NaN value:", newValue);
      return;
    }
    
    setSliderValue(actualValue);
    onValueChange(actualValue); // Always send a number, not an array
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const textValue = e.target.value.trim();
    if (textValue === '') return;
    
    const newValue = parseFloat(textValue);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      setSliderValue(newValue);
      handleChange(newValue);
    }
  };

  const handleIncrement = () => {
    const newValue = Math.min(sliderValue + step, max);
    setSliderValue(newValue);
    handleChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = Math.max(sliderValue - step, min);
    setSliderValue(newValue);
    handleChange(newValue);
  };

  // Ensure sliderValue is always a number for display
  const displayValue = isNaN(sliderValue) ? min : sliderValue;

  return (
    <div className="flex flex-row justify-between items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger type="button">
            <Slider
              value={[displayValue]}
              min={min}
              max={max}
              step={step}
              onValueChange={(values) => handleChange(values)}
              className="w-[250px] md:flex hidden"
            />
          </TooltipTrigger>
          <TooltipContent sideOffset={5}>{displayValue}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <div className="flex flex-row gap-2 items-center justify-center">
        <Button onClick={handleDecrement} variant={"outline"} type="button">
          -
        </Button>
        <Input
          value={displayValue.toString()}
          className="md:w-[60px]"
          onChange={handleInput}
          type="text"
        />
        <Button onClick={handleIncrement} variant={"outline"} type="button">
          +
        </Button>
      </div>
    </div>
  );
}

export default SliderWithCounter;
