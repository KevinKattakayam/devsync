import React from 'react';
import { createRoot } from 'react-dom/client';
import { VirtualizedKanbanControlsProof } from './combined-proof';

const root = document.getElementById('root');
if (root) createRoot(root).render(<VirtualizedKanbanControlsProof />);
