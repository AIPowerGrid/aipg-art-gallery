"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Undo2, Eraser, Paintbrush, Save, Trash2 } from 'lucide-react';
import { Slider } from "@/components/ui/slider";
import { Label } from '@/components/ui/label';

interface MaskCanvasProps {
  sourceImage: string;
  onSaveMask: (maskDataUrl: string) => void;
  width?: number;
  height?: number;
}

const MaskCanvas = ({
  sourceImage,
  onSaveMask,
  width = 512,
  height = 512,
}: MaskCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<'brush' | 'eraser'>('brush');
  const [history, setHistory] = useState<string[]>([]);
  
  // Initialize the canvas when the component mounts or the source image changes
  useEffect(() => {
    if (!canvasRef.current || !sourceImage) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Create a new image element
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceImage;
    
    img.onload = () => {
      imageRef.current = img;
      
      // Calculate dimensions to fit the image properly
      const imgRatio = img.width / img.height;
      const canvasRatio = canvas.width / canvas.height;
      
      let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
      
      if (imgRatio > canvasRatio) {
        // Image is wider than canvas
        drawWidth = canvas.width;
        drawHeight = canvas.width / imgRatio;
        offsetY = (canvas.height - drawHeight) / 2;
      } else {
        // Image is taller than canvas
        drawHeight = canvas.height;
        drawWidth = canvas.height * imgRatio;
        offsetX = (canvas.width - drawWidth) / 2;
      }
      
      // Draw image with proper dimensions and position
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      
      // Save the initial state in history
      const initialState = canvas.toDataURL('image/png');
      setHistory([initialState]);
    };
  }, [sourceImage]);
  
  // Drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    setIsDrawing(true);
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    
    // Set drawing style
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (mode === 'brush') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff'; // White for mask
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    }
  };
  
  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  
  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      
      // Save current state to history
      const canvas = canvasRef.current;
      const currentState = canvas.toDataURL('image/png');
      setHistory(prev => [...prev, currentState]);
    }
  };
  
  const undo = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    img.src = newHistory[newHistory.length - 1];
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
  };
  
  const clearCanvas = () => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Redraw the original image
    const img = imageRef.current;
    
    // Calculate dimensions to fit the image properly
    const imgRatio = img.width / img.height;
    const canvasRatio = canvas.width / canvas.height;
    
    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
    
    if (imgRatio > canvasRatio) {
      drawWidth = canvas.width;
      drawHeight = canvas.width / imgRatio;
      offsetY = (canvas.height - drawHeight) / 2;
    } else {
      drawHeight = canvas.height;
      drawWidth = canvas.height * imgRatio;
      offsetX = (canvas.width - drawWidth) / 2;
    }
    
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    
    // Reset history
    const newState = canvas.toDataURL('image/png');
    setHistory([newState]);
  };
  
  const saveMask = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    // Create a temporary canvas for the mask only
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Copy the current canvas content
    tempCtx.drawImage(canvas, 0, 0);
    
    // Extract only white pixels (our mask)
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    
    // For each pixel, convert to black and white mask
    for (let i = 0; i < data.length; i += 4) {
      // Check if pixel is not transparent and not black
      const isWhiteMask = data[i] > 200 && data[i+1] > 200 && data[i+2] > 200 && data[i+3] > 0;
      
      if (isWhiteMask) {
        // White pixel for mask
        data[i] = 255;
        data[i+1] = 255;
        data[i+2] = 255;
        data[i+3] = 255;
      } else {
        // Black pixel (transparent in mask)
        data[i] = 0;
        data[i+1] = 0;
        data[i+2] = 0;
        data[i+3] = 0;
      }
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // Get data URL of the mask
    const maskDataUrl = tempCanvas.toDataURL('image/png');
    onSaveMask(maskDataUrl);
  };
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative border border-zinc-700 rounded-lg overflow-hidden bg-zinc-900/50">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="cursor-crosshair"
        />
      </div>
      
      <div className="mt-4 w-full space-y-4">
        <div className="flex items-center space-x-2">
          <Label className="w-24">Brush Size:</Label>
          <Slider
            value={[brushSize]}
            min={5}
            max={100}
            step={1}
            onValueChange={(vals) => setBrushSize(vals[0])}
            className="flex-1"
          />
          <span className="text-sm text-zinc-300 w-8 text-right">{brushSize}</span>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === 'brush' ? 'default' : 'outline'}
            onClick={() => setMode('brush')}
            className="flex items-center"
          >
            <Paintbrush className="mr-1.5 h-4 w-4" />
            Paint
          </Button>
          
          <Button
            variant={mode === 'eraser' ? 'default' : 'outline'}
            onClick={() => setMode('eraser')}
            className="flex items-center"
          >
            <Eraser className="mr-1.5 h-4 w-4" />
            Erase
          </Button>
          
          <Button
            variant="outline"
            onClick={undo}
            disabled={history.length <= 1}
            className="flex items-center"
          >
            <Undo2 className="mr-1.5 h-4 w-4" />
            Undo
          </Button>
          
          <Button
            variant="outline"
            onClick={clearCanvas}
            className="flex items-center"
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            Clear
          </Button>
          
          <Button
            variant="default"
            onClick={saveMask}
            className="flex items-center ml-auto"
          >
            <Save className="mr-1.5 h-4 w-4" />
            Save Mask
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MaskCanvas; 