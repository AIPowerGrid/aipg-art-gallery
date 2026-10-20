// SPDX-FileCopyrightText: 2026 AI Power Grid
// SPDX-License-Identifier: AGPL-3.0-or-later
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { SizePicker } from '../size-picker';
import type { Model } from '@/lib/types/create';

it('shows unsupported MOSS sizes disabled rather than silently resizing the job', () => {
  const onChange = jest.fn();
  const model: Model = { id: 'MOSS Image SFT BF16', name: 'MOSS', description: '', type: 'image',
    enabled: true, default: false, limits: { width: { min: 512, max: 1344, step: 64 } } };
  render(<SizePicker model={model} selectedId={0} onChange={onChange} dimensions={[
    { id: 0, width: 1536, height: 640, label: 'Ultra Wide', aspectRatio: '2.4:1' },
    { id: 1, width: 1344, height: 768, label: 'Wide', aspectRatio: '16:9' },
  ]} />);
  const invalid = screen.getByRole('button', { name: '2.4:1' });
  expect(invalid).toBeDisabled();
  fireEvent.click(invalid);
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '16:9' }));
  expect(onChange).toHaveBeenCalledWith(1);
});
