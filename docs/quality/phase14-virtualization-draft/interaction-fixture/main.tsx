import React from 'react';
import { createRoot } from 'react-dom/client';
import { VirtualizedKanbanControlsProof } from './virtualized-kanban-controls-proof';

const root = document.getElementById('root');
if (root) createRoot(root).render(<VirtualizedKanbanControlsProof />);
