export const CASE = {
  bagPrice: 17, bagCost: 5.44, shipping: 4.5, processingRate: 0.045, packaging: 1.2,
  subscriptionPrice: 30.6, packPrice: 48, packPackaging: 1.4,
  ads: 8000, agencyFee: 1000, initialCash: 35000, minCash: 5000, fixedCosts: 6500,
  organicNew: 47, currentContribution: 9000, churnExisting: 0.03, churnSubscriptions: 0.09,
  shareOneOff: .85, shareSubscriptions: .15,
} as const;

export const AD_HISTORY = [{ads:0,customers:0},{ads:4000,customers:100},{ads:8000,customers:165},{ads:12000,customers:210},{ads:16000,customers:235},{ads:20000,customers:250}];
export const REPEAT_ORDERS = [1,.15,.2,.2,.2,.2,.2,.15,.15,.15,.2,.2];

export function customersFromAds(adSpend: number) {
  const spend = Math.max(0, Math.min(20000, adSpend));
  for(let i=1;i<AD_HISTORY.length;i++) {
    const a=AD_HISTORY[i-1], b=AD_HISTORY[i];
    if (spend <= b.ads) return a.customers + ((spend-a.ads)/(b.ads-a.ads))*(b.customers-a.customers);
  }
  return 250;
}

export function contribution(price: number, bags: number, shippingCost=4.5, packagingCost=1.2) {
  return price - (bags*CASE.bagCost + shippingCost + price*CASE.processingRate + packagingCost);
}

export const unitEconomics = {
  duo: contribution(34,2), subscription: contribution(CASE.subscriptionPrice,2), pack: contribution(48,3,4.5,1.4),
  discounted: contribution(34*.7,2), duoBuyerShipping: contribution(38.5,2),
};

export function retentionOrders(age: number) {
  if (age<=12) return REPEAT_ORDERS[age-1] ?? 0;
  return age<=24 ? .1 : 0;
}

export function ltv12(discountFirstOneOff = 0) {
  const oneOff = 3*unitEconomics.duo - discountFirstOneOff*(1-CASE.processingRate);
  const subscription = unitEconomics.subscription*Array.from({length:12}, (_,i) => Math.pow(.91,i)).reduce((sum,n)=>sum+n,0);
  const blend = oneOff*.85+subscription*.15;
  return {oneOff,subscription,blend};
}

export function cashCurve(cac: number, discountFirstOneOff=0) {
  const data=[{month:0,cash:-cac}];
  let cumulative=-cac;
  for(let month=1;month<=12;month++) {
    const oneOff = unitEconomics.duo*retentionOrders(month) - (month===1 ? discountFirstOneOff*(1-CASE.processingRate) : 0);
    const sub = unitEconomics.subscription*Math.pow(.91,month-1);
    cumulative+=oneOff*.85+sub*.15;
    data.push({month,cash:cumulative});
  }
  return data;
}

export function simulate24(budget: number | ((month:number)=>number), extras?:{firstDiscount?:number; packShare?:number}) {
  const rows: {month:number; ads:number; newMeta:number; newTotal:number; oldContribution:number; cohortContribution:number; expenses:number; cash:number; activeSubscribers:number; valid:boolean}[]=[];
  const cohorts:{month:number; customers:number}[]=[];
  let cash=CASE.initialCash;
  for(let month=1;month<=24;month++) {
    const spend=typeof budget === "function" ? budget(month) : budget;
    const meta=customersFromAds(spend), customers=meta+CASE.organicNew;
    cohorts.push({month,customers});
    const oldContribution=CASE.currentContribution*Math.pow(1-CASE.churnExisting,month-1);
    const cohortContribution=cohorts.reduce((sum,c) => {
      const age=month-c.month+1;
      let oneOff = unitEconomics.duo*retentionOrders(age);
      if (age===1 && extras?.firstDiscount) oneOff-=extras.firstDiscount*(1-CASE.processingRate);
      if(extras?.packShare) oneOff += extras.packShare*(unitEconomics.pack-unitEconomics.duo)*retentionOrders(age);
      return sum+c.customers*(.85*oneOff+.15*unitEconomics.subscription*Math.pow(.91,age-1));
    },0);
    const expenses=spend+(spend>0?CASE.agencyFee:0)+CASE.fixedCosts;
    cash+=oldContribution+cohortContribution-expenses;
    const activeSubscribers=cohorts.reduce((sum,c)=>sum+c.customers*.15*Math.pow(.91,month-c.month),0);
    rows.push({month,ads:spend,newMeta:meta,newTotal:customers,oldContribution,cohortContribution,expenses,cash,activeSubscribers,valid:cash>=CASE.minCash});
  }
  return {rows,endCash:cash,minCash:Math.min(...rows.map(r=>r.cash)),minMonth:rows.reduce((a,b)=>b.cash<a.cash?b:a).month,activeSubscribers:rows[23].activeSubscribers,viable:rows.every(r=>r.valid)};
}

export function rewardCost(type:"one_off" | "subscription", milestone=false) {
  return type === "subscription" ? 8+16.58 : 8+1.6+(milestone ? 5.44 : 0);
}
