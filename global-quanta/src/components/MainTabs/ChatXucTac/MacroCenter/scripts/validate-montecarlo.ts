import { adfTest, adfCriticalValues, mackinnonP, kpssTest, zivotAndrewsTest, mulberry32, randn, engleGranger } from '../src/quant-macro';
const rw = (n:number, rng:()=>number, drift=0)=>{const y=[0];for(let i=1;i<n;i++)y.push(y[i-1]+drift+randn(rng));return y;};
const ar = (n:number, phi:number, rng:()=>number)=>{const y=[0];for(let i=1;i<n;i++)y.push(phi*y[i-1]+randn(rng));return y;};
const T=200, N=400; const rng=mulberry32(7);
for (const det of ['n','c','ct'] as const) {
  let rej=0, pRej=0; const ps:number[]=[];
  for(let s=0;s<N;s++){ const r=adfTest(rw(T,rng), {det}); if(r.rejectUnitRoot5)rej++; if(r.pValue<0.05)pRej++; ps.push(r.pValue);} 
  console.log('ADF size', det, 'cv-reject', (rej/N).toFixed(3), 'p<0.05', (pRej/N).toFixed(3), 'cv5', adfCriticalValues(det,T)['5'].toFixed(3), 'mean p', (ps.reduce((a,b)=>a+b)/N).toFixed(3));
}
console.log('p at asympt cv5: n', mackinnonP(-1.941,'n').toFixed(4),'c', mackinnonP(-2.8616,'c').toFixed(4),'ct', mackinnonP(-3.4105,'ct').toFixed(4));
console.log('p at asympt cv1: n', mackinnonP(-2.5657,'n').toFixed(4),'c', mackinnonP(-3.4304,'c').toFixed(4),'ct', mackinnonP(-3.9588,'ct').toFixed(4));
{ let rej=0; for(let s=0;s<N;s++){ if(adfTest(ar(T,0.5,rng),{det:'c'}).rejectUnitRoot5)rej++; } console.log('ADF power AR(.5)', (rej/N).toFixed(3)); }
{ let rl=0, rt=0; for(let s=0;s<N;s++){ if(kpssTest(ar(T,0.3,rng),{trend:'c'}).rejectStationarity5)rl++; if(kpssTest(rw(T,rng),{trend:'c'}).rejectStationarity5)rt++; } console.log('KPSS size AR(.3)', (rl/N).toFixed(3),'power RW', (rt/N).toFixed(3)); }
{ const M=150; for (const m of ['intercept','trend','both'] as const){ let rej=0; for(let s=0;s<M;s++){ if(zivotAndrewsTest(rw(T,rng,0.1),{model:m,lag:2}).rejectUnitRoot5)rej++; } console.log('ZA size', m, (rej/M).toFixed(3)); } }
{ const M=200; let fa=0, ok=0; for(let s=0;s<M;s++){ const x=rw(150,rng); const y=rw(150,rng); if(engleGranger(y,x).cointegrated5)fa++; const y2=x.map(v=>2*v+randn(rng)); if(engleGranger(y2,x).cointegrated5)ok++; } console.log('EG false-coint', (fa/M).toFixed(3),'true-coint power', (ok/M).toFixed(3)); }
