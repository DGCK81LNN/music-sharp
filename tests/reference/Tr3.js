/*! @author cycwin <https://wiki.xdi8.top/wiki/User:Cycwin> */
function tr3(sim,s=";"){
var tempBpm=120
var freeze = 0
var a_T = 0;
var runit = 1;
var diff = 0;
var lastNoteLength = 1;
p=sim=sim.split(s).flatMap(x => x.match(/^[\dnzZR]/) ? x.split(/(?=[\dnzZR])/) : x)

//thanks LNN^

var returned=[];
var dict = {"1":-9,"2":-7,"3":-5,"4":-4,"5":-2,"6":0,"7":2}
for(var i=0;i<sim.length;i++){
//for start
runit = 1;
var o_t_s = sim[i];
q=o_t_s


//special characters
if(o_t_s[0]==="b"){//I have no choices
o_t = "bpm=" +o_t_s.slice(1,o_t_s.length);//I cant know is it correct
o_T = 0;
tempBpm=Number(o_t_s.slice(1,o_t_s.length))
runit = 0;
am=1
}
if(o_t_s[0]==="g"){//copied
o_t = "gain=" +o_t_s.slice(1,o_t_s.length);//I cant know is it correct
o_T = 0;
runit = 0;
}
if(o_t_s==="S"){
var freeze=1;
a_T -= o_T
o_T = 0;
runit = 0;
}
if(o_t_s==="E"){
var freeze=0;
o_T = 1;
runit = 0;
}
if(o_t_s[0]==="r"){
o_t="time-="+Number(o_t_s.slice(1,o_t_s.length))*60/tempBpm
o_T=0
runit=0
}
if(o_t_s[0]==="R"){
o_t="time-="+lastNoteLength*60/tempBpm
o_T=0
runit=0
}
if(o_t_s[0]==="h"){
suf=o_t_s.slice(1,o_t_s.length).split("&")
o_t="[noteHz("+suf[0]+","+suf[1]+"),1][1]"
o_T=1
runit=0
}
if(o_t_s[0]==="j"){
back=Number(o_t_s.slice(1,o_t_s.length))
sim.splice(i,1)
if(back>-1){
i=back-1
continue
}else{
i+=back-1
continue
}
o_t=""
o_T=0
runit=0
}
if(o_t_s[0]==="m"){
o_t=""
o_T=0
runit=0
diff=Number(o_t_s.slice(1,o_t_s.length))
}
if(o_t_s[0]=="a"){
o_t=""
o_T=0
runit=0
dict[o_t_s[1]]+=1
}
if(o_t_s[0]=="c"){
o_t=""
o_T=0
runit=0
dict[o_t_s[1]]-=1
}
//common characters
if(runit){
var o_t = o_t_s[0]==="n" ? "" : dict[o_t_s[0]]+diff;
var o_T = 1;
//processing suffix
if(o_t_s.length>1){
var down = o_t_s.indexOf(".")>0 && o_t_s.indexOf("_")>0 ? eval("throw new Error(\"What the ****A\")") : o_t_s.split("_").length-1;
var up = o_t_s.indexOf("_")>0 && o_t_s.indexOf(".")>0 ? eval("throw new Error(\"What the ****B\")") : o_t_s.split(".").length-1;
var filter_symbol = o_t_s.indexOf("#")>2 && o_t_s.indexOf("b")>0 ? eval("throw new Error(\"What the ****C\")") : o_t_s.split("#").length-1;
var b = o_t_s.indexOf("b")>2 && o_t_s.indexOf("#")>0 ? eval("throw new Error(\"What the ****D\")") : o_t_s.split("b").length-1;//BUG!!!!!!!!
var aske = o_t_s.split("*").length-1;
var divm = 2**(o_t_s.split("/").length-1);
var divn = (o_t_s.split("%").length-1);
var muln = (o_t_s.split("$").length-1);
if(down){
o_t -= 12*down;
}else if(up){
o_t += 12*up
}
if(filter_symbol){
o_t += filter_symbol;
}else if(b){
o_t -= b;
}
if(aske){
o_T += aske;
}
if(divm-1){
o_T /= divm;
}
if(divn){
o_T /= divn;
}
if(muln){
o_T *= muln;
}

}
//processing suffixes end
//drums
if(o_t_s[0]==="z"){
o_t="[noteHz(-8000,"+o_T+"),1][1]"
o_T=0
}
if(o_t_s[0]==="Z"){
o_t="[noteHz(-5657.7,"+o_T+"),1][1]"
o_T=0
}
//so we didnt enter the for repeat!This is still in if!
//we need a brace
a_T += o_T * !freeze;
lastNoteLength = o_T
}
//for repeat
returned+="[\""+o_t+"\","+o_T+(i===sim.length-1 ? "]" : "],")
if(freeze){
returned+="[\""+"time="+a_T+"\","+0+(i===sim.length-1 ? "]" : "],")
}
//The more brace?
} 

return "["+returned+"]"
}

function Tr3(code,s=";"){
for(let i of eval(tr3(code,s)))note(eval(i[0]),i[1])
}