export const CR_PROVINCES=["San José","Alajuela","Cartago","Heredia","Guanacaste","Puntarenas","Limón"] as const;
export type Delivery={receiverName:string;phone:string;province:string;canton:string;district:string;address:string;instructions:string};

export function validateDelivery(value:unknown):Delivery {
  if(!value || typeof value!=="object") throw new Error("Completa los datos de entrega en Costa Rica.");
  const row=value as Record<string,unknown>;
  function field(name:string,max:number,min:number) {
    const v=typeof row[name]==="string"?row[name].trim():"";
    if(v.length<min || v.length>max) throw new Error(`Revisa los datos de entrega: ${name}.`);
    return v;
  }
  const receiverName=field("receiverName",90,3),phone=field("phone",18,8);
  if(!/^(?:\+?506[ -]?)?[2-8][0-9]{3}[ -]?[0-9]{4}$/.test(phone)) throw new Error("Ingresa un teléfono válido de Costa Rica (8 dígitos).");
  const province=field("province",30,3);
  if(!CR_PROVINCES.some(p=>p===province)) throw new Error("Selecciona una provincia válida.");
  const canton=field("canton",65,2),district=field("district",65,2),address=field("address",240,12);
  const instructions=typeof row.instructions==="string"?row.instructions.trim():"";
  if(instructions.length>240) throw new Error("Las instrucciones de entrega son demasiado largas.");
  return {receiverName,phone,province,canton,district,address,instructions};
}
