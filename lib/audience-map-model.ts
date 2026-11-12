const maxLatitude=85.0511287798066;
const radius=6378137;
export function mapWorldPoint(latitude:number,longitude:number,zoom:number){
 const size=256*2**zoom,lat=Math.max(-maxLatitude,Math.min(maxLatitude,latitude))*Math.PI/180;
 return{x:(longitude+180)/360*size,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*size};
}
export function mapCoordinates(x:number,y:number,zoom:number){
 const size=256*2**zoom,wrapped=((x%size)+size)%size;
 return{latitude:Math.atan(Math.sinh(Math.PI*(1-2*Math.max(0,Math.min(size,y))/size)))*180/Math.PI,longitude:wrapped/size*360-180};
}
export function mapMetersPerPixel(latitude:number,zoom:number){return Math.cos(Math.max(-maxLatitude,Math.min(maxLatitude,latitude))*Math.PI/180)*2*Math.PI*radius/(256*2**zoom);}
export function mapDistance(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){
 const radians=Math.PI/180,dlat=(b.latitude-a.latitude)*radians,dlng=(b.longitude-a.longitude)*radians;
 const value=Math.sin(dlat/2)**2+Math.cos(a.latitude*radians)*Math.cos(b.latitude*radians)*Math.sin(dlng/2)**2;
 return 2*radius*Math.atan2(Math.sqrt(value),Math.sqrt(Math.max(0,1-value)));
}
export function visibleMapTiles(center:{latitude:number;longitude:number},zoom:number,width:number,height:number){
 const point=mapWorldPoint(center.latitude,center.longitude,zoom),count=2**zoom,tiles=[];
 for(let y=Math.floor((point.y-height/2)/256);y<=Math.floor((point.y+height/2)/256);y++){
  if(y<0||y>=count)continue;
  for(let x=Math.floor((point.x-width/2)/256);x<=Math.floor((point.x+width/2)/256);x++)tiles.push({x:((x%count)+count)%count,y,key:`${zoom}:${x}:${y}`,left:x*256-point.x+width/2,top:y*256-point.y+height/2});
 }
 return tiles;
}
