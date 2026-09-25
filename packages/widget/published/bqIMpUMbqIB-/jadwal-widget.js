var JadwalWidget=(function(e){Object.defineProperty(e,Symbol.toStringTag,{value:`Module`});var t=`jadwal-widget`,n=`jadwal:height:1`,r=320,i=2e4,a=2,o=new Set([`fr`,`de`,`it`,`ar`]),s=new Set([`semaine`,`cours`,`mois`]),c=new Set([`kids`,`youth`,`women`,`adults`,`open`]),l={fr:{titre:`Programme des cours`,lien:`Voir le programme complet`,nouvelOnglet:`s’ouvre dans un nouvel onglet`,mention:`Proposé gratuitement par jadwal, un service de Voltia`},de:{titre:`Kursprogramm`,lien:`Das ganze Programm ansehen`,nouvelOnglet:`öffnet sich in einem neuen Tab`,mention:`Kostenlos bereitgestellt von jadwal, einem Dienst von Voltia`},it:{titre:`Programma dei corsi`,lien:`Vedi tutto il programma`,nouvelOnglet:`si apre in una nuova scheda`,mention:`Offerto gratuitamente da jadwal, un servizio di Voltia`},ar:{titre:`برنامج الدروس`,lien:`عرض البرنامج كاملًا`,nouvelOnglet:`يُفتح في علامة تبويب جديدة`,mention:`مقدَّم مجانًا من jadwal، خدمة من Voltia`}},u=(()=>{try{let e=document.currentScript;return new URL(e?.src??``,document.baseURI).origin}catch{return``}})(),d=`
:host { display: block; contain: content; }
iframe { display: block; width: 100%; border: 0; color-scheme: normal; }
footer {
	font: 400 0.8rem/1.5 system-ui, -apple-system, sans-serif;
	color: #555;
	padding: 0.4rem 0 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}
a { color: #0f5c55; min-height: 24px; }
.pour-lecteur {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	border: 0;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
}
`,f=class extends HTMLElement{static observedAttributes=[`org`,`lang`,`view`,`audience`,`min-height`,`base`];#e;#t;#n;#r;#i;#a;#o=0;#s=e=>this.#m(e);connectedCallback(){this.#e||this.#c(),window.addEventListener(`message`,this.#s),this.#p()}disconnectedCallback(){window.removeEventListener(`message`,this.#s)}attributeChangedCallback(){this.#e&&this.#p()}#c(){let e=this.attachShadow({mode:`open`});this.#e=e;let t=document.createElement(`style`);t.textContent=d;let n=document.createElement(`footer`);this.#n=document.createElement(`a`),this.#n.target=`_blank`,this.#n.rel=`noopener`,this.#r=document.createTextNode(``),this.#i=document.createElement(`span`),this.#i.className=`pour-lecteur`,this.#n.append(this.#r,this.#i),this.#a=document.createElement(`span`),n.append(this.#n,this.#a),e.append(t,n)}#l(){let e=this.getAttribute(`lang`)?.trim().toLowerCase();return e&&o.has(e)?e:void 0}#u(){let e=Number(this.getAttribute(`min-height`));return!Number.isFinite(e)||e<=0?r:Math.min(Math.round(e),i)}#d(){let e=this.getAttribute(`base`)?.trim();if(e)try{return new URL(e,document.baseURI).origin}catch{}return u||window.location.origin}#f(e){let t=this.getAttribute(`org`)?.trim();if(!t)return;let n=this.#l(),r;try{r=new URL(`/m/${encodeURIComponent(t)}${n?`/${n}`:``}`,`${this.#d()}/`)}catch{return}let i=this.getAttribute(`view`)?.trim();i&&s.has(i)&&i!==`semaine`&&r.searchParams.set(`vue`,i);let a=this.getAttribute(`audience`)?.trim();return a&&c.has(a)&&r.searchParams.set(`public`,a),e&&r.searchParams.set(`embed`,`1`),r.toString()}#p(){let e=this.#e,t=this.#n,n=this.#r,r=this.#i,i=this.#a;if(!e||!t||!n||!r||!i)return;let a=l[this.#l()??`fr`]??l.fr;n.data=a.lien,r.textContent=` (${a.nouvelOnglet})`,i.textContent=a.mention;let o=this.#f(!1),s=this.#f(!0);if(!o||!s){this.#t?.remove(),this.#t=void 0,t.removeAttribute(`href`);return}t.href=o,this.#t?.remove();let c=document.createElement(`iframe`);c.title=a.titre,c.referrerPolicy=`no-referrer`,this.#o=this.#u(),c.style.height=`${this.#o}px`,c.src=s,this.#t=c,e.insertBefore(c,e.querySelector(`footer`))}#m(e){let t=this.#t;if(!t?.contentWindow||e.source!==t.contentWindow)return;let r;try{r=new URL(t.src).origin}catch{return}if(e.origin!==r)return;let o=e.data;if(!o||typeof o!=`object`||o.type!==n)return;let s=o.height;if(typeof s!=`number`||!Number.isFinite(s))return;let c=Math.min(Math.max(Math.round(s),this.#u()),i);Math.abs(c-this.#o)<=a||(this.#o=c,t.style.height=`${c}px`)}};function p(){typeof customElements>`u`||customElements.get(`jadwal-widget`)||customElements.define(t,f)}return p(),e.JadwalWidget=f,e.TAG_NAME=t,e.register=p,e})({});