// SPDX-FileCopyrightText: 2026 AI Power Grid
// SPDX-License-Identifier: AGPL-3.0-or-later
import { act, renderHook } from '@testing-library/react';
import { addToGallery } from '@/lib/api';
import { useJobStore } from '@/lib/stores/job-store';
import { useGeneration } from '../use-generation';
import type { Model, StylesConfig } from '@/lib/types/create';

jest.mock('@/lib/api', () => ({ addToGallery: jest.fn(), enhancePrompt: jest.fn() }));
jest.mock('@/lib/stores/job-store', () => ({ useJobStore: jest.fn() }));
jest.mock('@/lib/storage', () => ({ generateTagsFromPrompt: () => [] }));

const model: Model = {
  id: 'MOSS Image SFT BF16', name: 'MOSS Image SFT', description: '', type: 'image',
  enabled: true, default: false, status: 'online', supportsLora: false,
  capabilities: ['txt2img', 'img2img'],
  settings: { steps: 50, cfgScale: 3, sampler: 'euler', scheduler: 'simple' },
  limits: { steps: { min: 25, max: 50 }, width: { min: 512, max: 1344, step: 64 },
    height: { min: 512, max: 1344, step: 64 } },
};
const dimension = { id: 1, label: 'Wide', aspectRatio: '16:9', width: 1344, height: 768 };
const styles: StylesConfig = { models: [model], dimensions: [dimension], defaultDimensionId: 1,
  defaults: { steps: 28, cfgScale: 3.5, sampler: 'euler', scheduler: 'normal' } };
const submitJob = jest.fn();
const addJob = jest.fn();
const options = { styles, selectedModel: model, selectedDimension: dimension, batchMode: false,
  authenticated: true, ownerIdentifier: 'test-owner', onCreationAdded: jest.fn(), onShowAuthModal: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  (useJobStore as unknown as jest.Mock).mockReturnValue({ submitJob, addJob });
  submitJob.mockResolvedValue({ jobId: 'test-job', status: 'queued' });
  (addToGallery as jest.Mock).mockResolvedValue(undefined);
});

it.each([null, 'data:image/png;base64,c3ludGhldGlj'])('uses the MOSS schedule for source=%s and preserves it in history', async sourceImage => {
  const { result } = renderHook(() => useGeneration({ ...options, sourceImage }));
  let accepted = false;
  await act(async () => { accepted = await result.current.generate('a synthetic test scene'); });
  expect(accepted).toBe(true);
  expect(submitJob).toHaveBeenCalledTimes(1);
  expect(submitJob).toHaveBeenCalledWith(expect.objectContaining({
    modelId: model.id, sourceProcessing: sourceImage ? 'img2img' : 'txt2img',
    params: expect.objectContaining({ steps: 50, cfgScale: 3, sampler: 'euler', scheduler: 'simple', n: 1 }),
    ...(sourceImage ? { sourceImage } : {}),
  }), 'test-owner');
  expect(addToGallery).toHaveBeenCalledWith(expect.objectContaining({
    params: expect.objectContaining({ scheduler: 'simple' }),
  }));
});

it('retains the global scheduler fallback for models without an explicit setting', async () => {
  const { result } = renderHook(() => useGeneration({ ...options,
    selectedModel: { ...model, settings: { ...model.settings, scheduler: undefined } } }));
  await act(async () => { await result.current.generate('a synthetic test scene'); });
  expect(submitJob.mock.calls[0][0].params.scheduler).toBe('normal');
});

it('rejects an out-of-band size before saving or submitting a job', async () => {
  const { result } = renderHook(() => useGeneration({ ...options, selectedDimension: { ...dimension, width: 1536 } }));
  await act(async () => { expect(await result.current.generate('a synthetic test scene')).toBe(false); });
  expect(submitJob).not.toHaveBeenCalled();
  expect(addToGallery).not.toHaveBeenCalled();
  expect(result.current.error).toContain('supported image size');
});

it('rejects a stale adapter for a model with no approved injection path', async () => {
  const { result } = renderHook(() => useGeneration({ ...options, lora: { name: 'test-adapter' } }));
  await act(async () => { expect(await result.current.generate('a synthetic test scene')).toBe(false); });
  expect(submitJob).not.toHaveBeenCalled();
  expect(result.current.error).toContain('does not support LoRA');
});
