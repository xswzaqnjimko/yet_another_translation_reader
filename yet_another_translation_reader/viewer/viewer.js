/**
 * Aligning Text - Viewer v0.1.2
 * Two-panel viewer with proportional scroll sync, active paragraph highlighting,
 * and manual anchor-based alignment correction
 */

class AligningTextViewer {
  constructor() {
    // State
    this.urlA = null;
    this.urlB = null;
    this.blocksA = [];
    this.blocksB = [];
    this.layout = 'horizontal'; // 'horizontal' | 'vertical'
    this.syncMode = 'proportional'; // 'off' | 'proportional'
    this.swapped = false;
    this.isScrolling = false;
    this.scrollTimeout = null;
    
    // Anchor state for manual alignment correction
    // Each anchor is { indexA: number, indexB: number }
    this.anchors = [];
    // Pending anchor selection: { panel: 'a'|'b', index: number } or null
    this.pendingAnchor = null;
    // Alignment mode: 'proportional' | 'anchored'
    this.alignmentMode = 'proportional';
    
    // Mapping from A indices to B indices (computed from anchors)
    // mapAtoB[i] = j means block A[i] maps to block B[j]
    this.mapAtoB = [];
    this.mapBtoA = [];
    
    // DOM elements
    this.panelsContainer = document.getElementById('panels');
    this.panelA = document.getElementById('panel-a');
    this.panelB = document.getElementById('panel-b');
    this.contentA = document.getElementById('content-a');
    this.contentB = document.getElementById('content-b');
    this.titleA = document.getElementById('title-a');
    this.titleB = document.getElementById('title-b');
    this.statusEl = document.getElementById('status');
    this.anchorListEl = document.getElementById('anchor-list');
    
    this.init();
  }

  async init() {
    this.parseUrlParams();
    this.bindEvents();
    await this.loadContent();
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    this.urlA = params.get('a');
    this.urlB = params.get('b');
    
    if (!this.urlA || !this.urlB) {
      this.showError('Missing URL parameters. Please use the extension popup to open the viewer.');
    }
  }

  bindEvents() {
    // Layout toggle
    document.getElementById('btn-layout').addEventListener('click', () => this.toggleLayout());
    
    // Swap panels
    document.getElementById('btn-swap').addEventListener('click', () => this.swapPanels());
    
    // Scroll sync mode
    document.getElementById('select-sync').addEventListener('change', (e) => {
      this.syncMode = e.target.value;
    });
    
    // Clear all anchors
    document.getElementById('btn-clear-anchors').addEventListener('click', () => this.clearAllAnchors());
    
    // Cancel pending anchor
    document.getElementById('btn-cancel-anchor').addEventListener('click', () => this.cancelPendingAnchor());
    
    // Scroll listeners for sync
    this.contentA.addEventListener('scroll', () => this.handleScroll('a'));
    this.contentB.addEventListener('scroll', () => this.handleScroll('b'));
  }

  toggleLayout() {
    this.layout = this.layout === 'horizontal' ? 'vertical' : 'horizontal';
    this.panelsContainer.classList.toggle('layout-horizontal', this.layout === 'horizontal');
    this.panelsContainer.classList.toggle('layout-vertical', this.layout === 'vertical');
    
    const label = document.getElementById('layout-label');
    const icon = document.querySelector('.layout-icon');
    
    if (this.layout === 'horizontal') {
      label.textContent = 'Left / Right';
      icon.textContent = '◫';
    } else {
      label.textContent = 'Top / Bottom';
      icon.textContent = '⬒';
    }
  }

  swapPanels() {
    this.swapped = !this.swapped;
    
    // Swap visual order
    if (this.swapped) {
      this.panelsContainer.insertBefore(this.panelB, this.panelA);
    } else {
      this.panelsContainer.insertBefore(this.panelA, this.panelB);
    }
    
    // Ensure divider is in the middle
    const divider = document.getElementById('divider');
    const firstPanel = this.panelsContainer.querySelector('.panel');
    firstPanel.after(divider);
  }

  async loadContent() {
    try {
      this.setStatus('Fetching texts...', 'loading');
      
      // Fetch both URLs in parallel
      const [htmlA, htmlB] = await Promise.all([
        this.fetchPage(this.urlA),
        this.fetchPage(this.urlB)
      ]);
      
      // Extract content
      this.setStatus('Extracting paragraphs...', 'loading');
      
      const dataA = this.extractAO3Content(htmlA);
      const dataB = this.extractAO3Content(htmlB);
      
      this.blocksA = dataA.blocks;
      this.blocksB = dataB.blocks;
      
      // Update titles
      this.titleA.textContent = dataA.title || 'Text A';
      this.titleB.textContent = dataB.title || 'Text B';
      
      // Compute initial proportional mapping
      this.computeMapping();
      
      // Render content
      this.renderBlocks(this.contentA, this.blocksA, 'a');
      this.renderBlocks(this.contentB, this.blocksB, 'b');
      
      this.setStatus('Ready', 'ready');
      
    } catch (error) {
      console.error('Load error:', error);
      this.setStatus('Error loading content', 'error');
      this.showError(`Failed to load content: ${error.message}`);
    }
  }

  async fetchPage(url) {
    const response = await fetch(url, {
      credentials: 'include' // Include cookies for logged-in AO3 users
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    
    return await response.text();
  }

  extractAO3Content(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Get work title
    const titleEl = doc.querySelector('.title.heading') || doc.querySelector('h2.title');
    const title = titleEl ? titleEl.textContent.trim() : null;
    
    // Get chapter title if present
    const chapterTitleEl = doc.querySelector('.chapter.preface.group h3.title');
    const chapterTitle = chapterTitleEl ? chapterTitleEl.textContent.trim() : null;
    const fullTitle = chapterTitle 
      ? `${title} - ${chapterTitle}`
      : title;
    
    // Find the main content container
    let contentContainer = null;
    
    // Try: chapter article content (for multi-chapter works)
    const chapterArticle = doc.querySelector('.chapter[role="article"]');
    if (chapterArticle) {
      contentContainer = chapterArticle.querySelector('.userstuff');
    }
    
    // Fallback: single-chapter work structure
    if (!contentContainer) {
      const chaptersDiv = doc.querySelector('#chapters');
      if (chaptersDiv) {
        const allUserstuff = chaptersDiv.querySelectorAll('.userstuff');
        for (const us of allUserstuff) {
          if (!us.closest('.preface')) {
            contentContainer = us;
            break;
          }
        }
      }
    }
    
    // Final fallback
    if (!contentContainer) {
      contentContainer = doc.querySelector('.userstuff.module') ||
                         doc.querySelector('.userstuff');
    }
    
    if (!contentContainer) {
      throw new Error('Could not find story content. Is this a valid AO3 work?');
    }
    
    // Extract blocks (paragraphs and other block elements)
    const blocks = [];
    const blockElements = contentContainer.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6, hr');
    
    // AO3 landmark headings to skip (they're for screen readers, not content)
    const landmarkHeadings = ['chapter text', 'notes:', 'summary:', 'chapter notes'];
    
    blockElements.forEach((el, index) => {
      const text = el.textContent.trim();
      
      // Skip empty paragraphs
      if (!text && el.tagName !== 'HR') return;
      
      // Skip AO3 landmark/accessibility headings
      if (el.tagName.match(/^H[1-6]$/) && landmarkHeadings.includes(text.toLowerCase())) {
        return;
      }
      
      const block = {
        id: `block-${blocks.length}`,
        text: text,
        html: el.innerHTML,
        charCount: text.length,
        punctCount: (text.match(/[.,?!…;:]/g) || []).length,
        type: this.getBlockType(el)
      };
      
      blocks.push(block);
    });
    
    return { title: fullTitle, blocks };
  }

  getBlockType(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'hr') return 'break';
    if (tag === 'blockquote') return 'quote';
    if (tag.match(/^h[1-6]$/)) return 'heading';
    return 'paragraph';
  }

  // ==================== MAPPING COMPUTATION ====================
  
  /**
   * Compute mapping between A and B blocks.
   * Uses anchors to constrain alignment within segments.
   */
  computeMapping() {
    const lenA = this.blocksA.length;
    const lenB = this.blocksB.length;
    
    if (lenA === 0 || lenB === 0) {
      this.mapAtoB = [];
      this.mapBtoA = [];
      return;
    }
    
    // Sort anchors by A index
    const sortedAnchors = [...this.anchors].sort((a, b) => a.indexA - b.indexA);
    
    // Build segments between anchors
    // Each segment: { startA, endA, startB, endB } (inclusive)
    const segments = [];
    
    let prevA = 0;
    let prevB = 0;
    
    for (const anchor of sortedAnchors) {
      // Segment before this anchor
      if (anchor.indexA > prevA || anchor.indexB > prevB) {
        segments.push({
          startA: prevA,
          endA: anchor.indexA,
          startB: prevB,
          endB: anchor.indexB
        });
      }
      prevA = anchor.indexA;
      prevB = anchor.indexB;
    }
    
    // Final segment after last anchor
    segments.push({
      startA: prevA,
      endA: lenA - 1,
      startB: prevB,
      endB: lenB - 1
    });
    
    // Compute proportional mapping within each segment
    this.mapAtoB = new Array(lenA);
    this.mapBtoA = new Array(lenB);
    
    for (const seg of segments) {
      const segLenA = seg.endA - seg.startA;
      const segLenB = seg.endB - seg.startB;
      
      // Map A indices in this segment to B indices
      for (let i = seg.startA; i <= seg.endA; i++) {
        const ratio = segLenA > 0 ? (i - seg.startA) / segLenA : 0;
        const j = seg.startB + Math.round(ratio * segLenB);
        this.mapAtoB[i] = Math.min(j, seg.endB);
      }
      
      // Map B indices in this segment to A indices
      for (let j = seg.startB; j <= seg.endB; j++) {
        const ratio = segLenB > 0 ? (j - seg.startB) / segLenB : 0;
        const i = seg.startA + Math.round(ratio * segLenA);
        this.mapBtoA[j] = Math.min(i, seg.endA);
      }
    }
    
    // Update alignment mode indicator
    this.alignmentMode = this.anchors.length > 0 ? 'anchored' : 'proportional';
  }
  
  /**
   * Get the mapped index in the other panel
   */
  getMappedIndex(sourcePanel, sourceIndex) {
    if (sourcePanel === 'a') {
      return this.mapAtoB[sourceIndex] ?? 0;
    } else {
      return this.mapBtoA[sourceIndex] ?? 0;
    }
  }

  // ==================== ANCHOR MANAGEMENT ====================
  
  /**
   * Handle block click - either set anchor or navigate
   */
  handleBlockClick(panelId, index, event) {
    // Shift+click or if there's a pending anchor: set anchor
    if (event.shiftKey || this.pendingAnchor) {
      this.handleAnchorClick(panelId, index);
    } else {
      // Normal click: navigate to counterpart
      this.navigateToCounterpart(panelId, index);
    }
  }
  
  /**
   * Handle anchor selection click
   */
  handleAnchorClick(panelId, index) {
    if (!this.pendingAnchor) {
      // First click: set pending anchor
      this.pendingAnchor = { panel: panelId, index };
      this.updatePendingAnchorUI();
      this.highlightPendingAnchor(panelId, index);
    } else {
      // Second click: complete the anchor pair
      if (this.pendingAnchor.panel === panelId) {
        // Clicked same panel - update pending
        this.pendingAnchor = { panel: panelId, index };
        this.updatePendingAnchorUI();
        this.highlightPendingAnchor(panelId, index);
      } else {
        // Different panel - create anchor
        let indexA, indexB;
        if (this.pendingAnchor.panel === 'a') {
          indexA = this.pendingAnchor.index;
          indexB = index;
        } else {
          indexA = index;
          indexB = this.pendingAnchor.index;
        }
        
        this.addAnchor(indexA, indexB);
        this.pendingAnchor = null;
        this.updatePendingAnchorUI();
      }
    }
  }
  
  /**
   * Add a new anchor pair
   */
  addAnchor(indexA, indexB) {
    // Check if anchor already exists at this position
    const existing = this.anchors.findIndex(a => a.indexA === indexA && a.indexB === indexB);
    if (existing >= 0) return;
    
    // Remove any anchors that would conflict (same A or B index)
    this.anchors = this.anchors.filter(a => a.indexA !== indexA && a.indexB !== indexB);
    
    // Add new anchor
    this.anchors.push({ indexA, indexB });
    
    // Sort by A index
    this.anchors.sort((a, b) => a.indexA - b.indexA);
    
    // Recompute mapping
    this.computeMapping();
    
    // Update UI
    this.updateAnchorMarkers();
    this.updateAnchorList();
    
    this.setStatus(`${this.anchors.length} anchor(s)`, 'ready');
  }
  
  /**
   * Remove an anchor by index
   */
  removeAnchor(anchorIndex) {
    this.anchors.splice(anchorIndex, 1);
    this.computeMapping();
    this.updateAnchorMarkers();
    this.updateAnchorList();
    
    this.setStatus(this.anchors.length > 0 ? `${this.anchors.length} anchor(s)` : 'Ready', 'ready');
  }
  
  /**
   * Clear all anchors
   */
  clearAllAnchors() {
    this.anchors = [];
    this.pendingAnchor = null;
    this.computeMapping();
    this.updateAnchorMarkers();
    this.updateAnchorList();
    this.updatePendingAnchorUI();
    
    this.setStatus('Ready', 'ready');
  }
  
  /**
   * Cancel pending anchor selection
   */
  cancelPendingAnchor() {
    this.pendingAnchor = null;
    this.updatePendingAnchorUI();
    this.clearHighlights();
  }
  
  // ==================== UI UPDATES ====================
  
  /**
   * Update the pending anchor indicator
   */
  updatePendingAnchorUI() {
    const indicator = document.getElementById('pending-anchor-indicator');
    const cancelBtn = document.getElementById('btn-cancel-anchor');
    
    if (this.pendingAnchor) {
      const panelLabel = this.pendingAnchor.panel.toUpperCase();
      const blockNum = this.pendingAnchor.index + 1;
      indicator.textContent = `Selected ${panelLabel}:¶${blockNum} — now click a paragraph in the other panel`;
      indicator.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
    } else {
      indicator.classList.add('hidden');
      cancelBtn.classList.add('hidden');
    }
  }
  
  /**
   * Update anchor markers on paragraphs
   */
  updateAnchorMarkers() {
    // Clear existing markers
    document.querySelectorAll('.paragraph').forEach(el => {
      el.classList.remove('anchored', 'pending-anchor');
      const marker = el.querySelector('.anchor-marker');
      if (marker) marker.remove();
    });
    
    // Add markers for each anchor
    this.anchors.forEach((anchor, idx) => {
      const elA = this.contentA.querySelector(`[data-index="${anchor.indexA}"]`);
      const elB = this.contentB.querySelector(`[data-index="${anchor.indexB}"]`);
      
      if (elA) {
        elA.classList.add('anchored');
        const marker = document.createElement('span');
        marker.className = 'anchor-marker';
        marker.textContent = `⚓${idx + 1}`;
        marker.title = `Anchor ${idx + 1}: A:¶${anchor.indexA + 1} ↔ B:¶${anchor.indexB + 1}`;
        elA.insertBefore(marker, elA.firstChild);
      }
      
      if (elB) {
        elB.classList.add('anchored');
        const marker = document.createElement('span');
        marker.className = 'anchor-marker';
        marker.textContent = `⚓${idx + 1}`;
        marker.title = `Anchor ${idx + 1}: A:¶${anchor.indexA + 1} ↔ B:¶${anchor.indexB + 1}`;
        elB.insertBefore(marker, elB.firstChild);
      }
    });
  }
  
  /**
   * Update the anchor list sidebar
   */
  updateAnchorList() {
    if (!this.anchorListEl) return;
    
    if (this.anchors.length === 0) {
      this.anchorListEl.innerHTML = '<div class="anchor-empty">No anchors set.<br><small>Shift+click paragraphs to create anchors.</small></div>';
      return;
    }
    
    let html = '';
    this.anchors.forEach((anchor, idx) => {
      const previewA = this.blocksA[anchor.indexA]?.text.slice(0, 30) || '';
      const previewB = this.blocksB[anchor.indexB]?.text.slice(0, 30) || '';
      
      html += `
        <div class="anchor-item" data-anchor-index="${idx}">
          <div class="anchor-item-header">
            <span class="anchor-item-title">⚓ Anchor ${idx + 1}</span>
            <button class="anchor-delete-btn" data-anchor-index="${idx}" title="Remove anchor">×</button>
          </div>
          <div class="anchor-item-detail">
            <span class="anchor-side">A:¶${anchor.indexA + 1}</span>
            <span class="anchor-preview" title="${this.escapeHtml(previewA)}">${this.escapeHtml(previewA)}…</span>
          </div>
          <div class="anchor-item-detail">
            <span class="anchor-side">B:¶${anchor.indexB + 1}</span>
            <span class="anchor-preview" title="${this.escapeHtml(previewB)}">${this.escapeHtml(previewB)}…</span>
          </div>
        </div>
      `;
    });
    
    this.anchorListEl.innerHTML = html;
    
    // Bind delete buttons
    this.anchorListEl.querySelectorAll('.anchor-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.anchorIndex);
        this.removeAnchor(idx);
      });
    });
    
    // Bind click to jump
    this.anchorListEl.querySelectorAll('.anchor-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.anchorIndex);
        const anchor = this.anchors[idx];
        if (anchor) {
          this.jumpToAnchor(anchor);
        }
      });
    });
  }
  
  /**
   * Jump to an anchor location
   */
  jumpToAnchor(anchor) {
    const elA = this.contentA.querySelector(`[data-index="${anchor.indexA}"]`);
    const elB = this.contentB.querySelector(`[data-index="${anchor.indexB}"]`);
    
    if (elA) elA.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (elB) elB.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    this.highlightBlock('a', anchor.indexA);
    this.highlightBlock('b', anchor.indexB);
  }
  
  /**
   * Highlight pending anchor selection
   */
  highlightPendingAnchor(panelId, index) {
    // Clear previous pending highlights
    document.querySelectorAll('.pending-anchor').forEach(el => {
      el.classList.remove('pending-anchor');
    });
    
    const content = panelId === 'a' ? this.contentA : this.contentB;
    const el = content.querySelector(`[data-index="${index}"]`);
    if (el) {
      el.classList.add('pending-anchor');
    }
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ==================== RENDERING ====================

  renderBlocks(container, blocks, panelId) {
    container.innerHTML = '';
    
    if (blocks.length === 0) {
      container.innerHTML = '<p class="error-message">No content found.</p>';
      return;
    }
    
    blocks.forEach((block, index) => {
      const el = document.createElement('div');
      el.className = `paragraph type-${block.type}`;
      el.dataset.index = index;
      el.dataset.panel = panelId;
      
      if (block.type === 'break') {
        el.innerHTML = '<hr>';
      } else {
        el.innerHTML = block.html || block.text;
      }
      
      // Click to highlight and scroll counterpart (or set anchor with Shift)
      el.addEventListener('click', (e) => this.handleBlockClick(panelId, index, e));
      
      container.appendChild(el);
    });
    
    // Update anchor markers after rendering
    this.updateAnchorMarkers();
  }

  /**
   * Navigate to counterpart paragraph
   */
  navigateToCounterpart(panelId, index) {
    const targetPanel = panelId === 'a' ? 'b' : 'a';
    const targetIndex = this.getMappedIndex(panelId, index);
    const targetContent = panelId === 'a' ? this.contentB : this.contentA;
    
    // Highlight both
    this.highlightBlock(panelId, index);
    this.highlightBlock(targetPanel, targetIndex);
    
    // Scroll target into view
    const targetEl = targetContent.querySelector(`[data-index="${targetIndex}"]`);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  highlightBlock(panelId, index) {
    const content = panelId === 'a' ? this.contentA : this.contentB;
    const highlightClass = panelId === 'a' ? 'active-a' : 'active-b';
    
    // Remove existing highlights (but keep anchor markers)
    content.querySelectorAll('.paragraph').forEach(el => {
      el.classList.remove('active-a', 'active-b');
    });
    
    // Add new highlight
    const el = content.querySelector(`[data-index="${index}"]`);
    if (el) {
      el.classList.add(highlightClass);
    }
  }
  
  clearHighlights() {
    document.querySelectorAll('.paragraph').forEach(el => {
      el.classList.remove('active-a', 'active-b', 'pending-anchor');
    });
  }

  handleScroll(sourcePanel) {
    if (this.syncMode === 'off') return;
    if (this.isScrolling) return;
    
    this.isScrolling = true;
    
    const sourceContent = sourcePanel === 'a' ? this.contentA : this.contentB;
    const targetContent = sourcePanel === 'a' ? this.contentB : this.contentA;
    
    // Calculate scroll ratio
    const scrollTop = sourceContent.scrollTop;
    const scrollHeight = sourceContent.scrollHeight - sourceContent.clientHeight;
    const ratio = scrollHeight > 0 ? scrollTop / scrollHeight : 0;
    
    // Apply to target
    const targetScrollHeight = targetContent.scrollHeight - targetContent.clientHeight;
    targetContent.scrollTop = ratio * targetScrollHeight;
    
    // Update active paragraph highlighting
    this.updateActiveHighlight(sourcePanel);
    
    // Debounce scroll lock release
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.isScrolling = false;
    }, 50);
  }

  updateActiveHighlight(sourcePanel) {
    const sourceContent = sourcePanel === 'a' ? this.contentA : this.contentB;
    
    // Find paragraph closest to center of viewport
    const viewportCenter = sourceContent.scrollTop + sourceContent.clientHeight / 2;
    let closestIndex = 0;
    let closestDistance = Infinity;
    
    sourceContent.querySelectorAll('.paragraph').forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const containerRect = sourceContent.getBoundingClientRect();
      const elCenter = (rect.top - containerRect.top) + sourceContent.scrollTop + rect.height / 2;
      const distance = Math.abs(elCenter - viewportCenter);
      
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    
    // Highlight source
    this.highlightBlock(sourcePanel, closestIndex);
    
    // Use computed mapping for target
    const targetPanel = sourcePanel === 'a' ? 'b' : 'a';
    const targetIndex = this.getMappedIndex(sourcePanel, closestIndex);
    this.highlightBlock(targetPanel, targetIndex);
  }

  setStatus(text, state = 'loading') {
    this.statusEl.textContent = text;
    this.statusEl.className = `status ${state}`;
  }

  showError(message) {
    const errorHtml = `
      <div class="error-message">
        <p>${message}</p>
        <p><a href="${this.urlA}" target="_blank">Open Text A</a> | 
           <a href="${this.urlB}" target="_blank">Open Text B</a></p>
      </div>
    `;
    this.contentA.innerHTML = errorHtml;
    this.contentB.innerHTML = errorHtml;
  }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  window.viewer = new AligningTextViewer();
});
