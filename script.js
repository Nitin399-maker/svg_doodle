import { bootstrapAlert } from "https://cdn.jsdelivr.net/npm/bootstrap-alert@1";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

let tl = null, svg = null, provider = null;

const initLLM = async (show = false) => {
    try {
        const cfg = await openaiConfig({
            title: "LLM Configuration for SVG Generator",
            defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"],
            show
        });
        provider = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model: cfg.model };
        bootstrapAlert({ body: 'LLM configuration saved!', color: 'success' });
    } catch (e) {
        bootstrapAlert({ body: `Failed to configure LLM: ${e.message}`, color: 'danger' });
    }
};

// Generate SVG
const genSVG = async () => {
    const p = document.getElementById('prompt').value.trim();
    if (!p) return bootstrapAlert({ body: 'Enter prompt', color: 'warning' });
    const btn = document.getElementById('generate-svg');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
    try {
        const systemPrompt = `You are an SVG generator. Create clean, simple SVG code based on user prompts.

REQUIREMENTS:
- Only use <path> elements for all shapes (no <rect>, <circle>, <line>, etc.)
- Set fill="none" and stroke="black" for all paths
- Use stroke-width="2" 
- Include proper viewBox (e.g., viewBox="0 0 200 200")
- Keep designs simple and clean
- Return only the SVG code, no explanations

Example output:
<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <path d="M50,50 L150,50 L150,150 L50,150 Z" fill="none" stroke="black" stroke-width="2"/>
</svg>`;

        const res = await fetch(`${provider.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${provider.apiKey}` 
            },
            body: JSON.stringify({
                model: provider.model || 'gpt-5-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: p }
                ]
            })
        });
        
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        
        const data = await res.json();
        let svg = data.choices[0].message.content;
        const match = svg.match(/<svg[^>]*>[\s\S]*?<\/svg>/i);
        if (match) svg = match[0];
        
        const parser = new DOMParser();
        if (parser.parseFromString(svg, 'image/svg+xml').querySelector('parsererror')) {
            throw new Error('Invalid SVG generated');
        }
        
        document.getElementById('svgInput').value = svg.trim();
        document.getElementById('a').disabled = false;
        bootstrapAlert({ body: 'SVG generated!', color: 'success' });
        
    } catch (e) {
        bootstrapAlert({ body: `Error: ${e.message}`, color: 'danger' });
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-magic"></i> Generate SVG';
    }
};

// Sync controls
[['r','rv'],['w','wv'],['d','dv']].forEach(([a,b]) => {
    const [x,y] = [document.getElementById(a), document.getElementById(b)];
    x.oninput = () => y.value = x.value;
    y.oninput = () => x.value = y.value;
});

// Generate rough path
const rough = (p, r) => {
    const len = p.getTotalLength(), segs = Math.max(10, len/5);
    let path = '';
    for (let i = 0; i <= segs; i++) {
        const pt = p.getPointAtLength(len/segs * i);
        const x = pt.x + (Math.random()-.5) * r * 2;
        const y = pt.y + (Math.random()-.5) * r * 2;
        if (!i) path += `M ${x} ${y}`;
        else path += r > 1.5 ? ` Q ${(p.getPointAtLength(len/segs*(i-1)).x+x)/2+(Math.random()-.5)*r} ${(p.getPointAtLength(len/segs*(i-1)).y+y)/2+(Math.random()-.5)*r} ${x} ${y}` : ` L ${x} ${y}`;
    }
    return path;
};

// Create strokes
const strokes = (p, r, w, c) => {
    const n = r > 2 ? 3 : r > 1 ? 2 : 1, arr = [];
    for (let i = 0; i < n; i++) {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        s.setAttribute('d', rough(p, r));
        s.setAttribute('fill', 'none');
        s.setAttribute('stroke', c);
        s.setAttribute('stroke-width', w * (1 - i * .2));
        s.setAttribute('stroke-opacity', 1 - i * .3);
        s.setAttribute('stroke-linecap', 'round');
        s.setAttribute('stroke-linejoin', 'round');
        const len = s.getTotalLength();
        s.style.strokeDasharray = s.style.strokeDashoffset = len;
        s.style.opacity = 0;
        arr.push(s);
    }
    return arr;
};

// Animation
const animate = () => {
    try {
        if (tl) { tl.pause(); tl = null; }
        
        const input = document.getElementById('svgInput').value.trim();
        if (!input) return bootstrapAlert({ body: 'Generate SVG first!', color: 'warning' });
        
        const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
        if (doc.querySelector('parsererror')) return bootstrapAlert({ body: 'Invalid SVG', color: 'danger' });
        
        const svgEl = doc.documentElement;
        if (svgEl.tagName !== 'svg') return bootstrapAlert({ body: 'Must be <svg>', color: 'danger' });
        
        const paths = svgEl.querySelectorAll('path');
        if (!paths.length) return bootstrapAlert({ body: 'No paths found', color: 'danger' });
        
        const [r, w, c, dur, type] = [+document.getElementById('r').value, +document.getElementById('w').value, document.getElementById('c').value, +document.getElementById('d').value, +document.getElementById('t').value];
        
        const out = document.getElementById('o');
        out.innerHTML = '';
        
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', svgEl.getAttribute('viewBox') || '0 0 200 200');
        svg.style.cssText = 'width:100%;height:100%;max-width:400px;max-height:400px';
        
        const temp = svgEl.cloneNode(true);
        document.body.appendChild(temp);
        temp.style.cssText = 'position:absolute;visibility:hidden;width:400px;height:400px';
        
        paths.forEach((_, i) => {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('data-i', i);
            strokes(temp.querySelectorAll('path')[i], r, w, c).forEach(s => g.appendChild(s));
            svg.appendChild(g);
        });
        
        document.body.removeChild(temp);
        out.appendChild(svg);

        const all = svg.querySelectorAll('path');
        if (!all.length) return bootstrapAlert({ body: 'No paths to animate', color: 'danger' });
        
        tl = anime.timeline({
            easing: 'easeInOutQuad',
            complete: () => bootstrapAlert({ body: 'Animation done!', color: 'success' })
        });
        
        all.forEach(p => {
            const len = p.getTotalLength();
            p.style.strokeDasharray = p.style.strokeDashoffset = len;
            p.style.opacity = 0;
        });
        
        const groups = {};
        all.forEach(p => {
            const i = p.parentElement.getAttribute('data-i');
            (groups[i] = groups[i] || []).push(p);
        });
        
        const gc = Object.keys(groups).length;
        
        if (type === 1) {
            Object.values(groups).forEach(g => g.forEach((p, i) => tl.add({
                targets: p, strokeDashoffset: [p.getTotalLength(), 0], opacity: [0, 1], 
                duration: dur, delay: i * 100, easing: 'easeInOutQuad'
            }, 0)));
        } else if (type === 2) {
            let ct = 0; const pd = dur / gc;
            Object.values(groups).forEach(g => {
                g.forEach((p, i) => tl.add({
                    targets: p, strokeDashoffset: [p.getTotalLength(), 0], opacity: [0, 1],
                    duration: pd, delay: i * 50, easing: 'easeInOutQuad'
                }, ct));
                ct += pd * .8;
            });
        } else {
            Object.values(groups).forEach((g, gi) => g.forEach((p, i) => tl.add({
                targets: p, strokeDashoffset: [p.getTotalLength(), 0], opacity: [0, 1],
                duration: dur * .8, delay: i * 100, easing: 'easeInOutQuad'
            }, gi * (dur / gc * .3))));
        }
        
        document.getElementById('reset').disabled = false;
        
    } catch (e) {
        bootstrapAlert({ body: `Error: ${e.message}`, color: 'danger' });
    }
};

// Reset
const reset = () => {
    if (!svg) return;
    if (tl) { tl.pause(); tl.seek(0); }
    svg.querySelectorAll('path').forEach(p => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = p.style.strokeDashoffset = len;
        p.style.opacity = 0;
    });
    bootstrapAlert({ body: 'Reset', color: 'info' });
};

// Events
document.getElementById('config-btn').onclick = () => initLLM(true);
document.getElementById('generate-svg').onclick = genSVG;
document.getElementById('a').onclick = animate;
document.getElementById('reset').onclick = reset;

// Init - Try to load existing config
initLLM().then(() => {
    if (provider) {
        bootstrapAlert({ body: 'LLM config loaded', color: 'info' });
    } else {
        bootstrapAlert({ body: 'Click Config LLM to setup', color: 'info' });
    }
}).catch(() => {
    bootstrapAlert({ body: 'Click Config LLM to setup', color: 'info' });
});