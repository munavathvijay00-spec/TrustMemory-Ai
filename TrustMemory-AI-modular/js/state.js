/* =========================================================================
   state.js — agency roster, global state (S, MEM, SCORES, SCORE_HISTORY)
   ========================================================================= */

function seed(){
  const helpers = [
    {id:'anita', name:'Anita Verma', location:'Hyderabad', exp:6,
      skills:['elder_care','cleaning'], availability:'Full-time',
      color:'#8F6A2E'},
    {id:'priya', name:'Priya Nair', location:'Hyderabad', exp:4,
      skills:['elder_care','child_care','cleaning'], availability:'Full-time',
      color:'#3F6659'},
    {id:'radha', name:'Radha Kumari', location:'Secunderabad', exp:7,
      skills:['child_care','cooking'], availability:'Full-time',
      color:'#5B4A8F'},
    {id:'sunita', name:'Sunita Devi', location:'Hyderabad', exp:3,
      skills:['cleaning','cooking'], availability:'Part-time',
      color:'#A6453A'},
    {id:'meena', name:'Meena Joshi', location:'Gachibowli', exp:9,
      skills:['elder_care','cooking'], availability:'Full-time',
      color:'#31507A'},
    {id:'kavita', name:'Kavita Reddy', location:'Kukatpally', exp:5,
      skills:['child_care'], availability:'Full-time',
      color:'#8F6A2E'},
    {id:'lakshmi', name:'Lakshmi Rao', location:'Hyderabad', exp:10,
      skills:['cleaning'], availability:'Full-time',
      color:'#3F6659'},
    {id:'fatima', name:'Fatima Sheikh', location:'Begumpet', exp:2,
      skills:['elder_care','child_care'], availability:'Full-time',
      color:'#5B4A8F'},
  ];
  // The helper profile page still reads h.roleScores. There are no invented per-role
  // numbers any more: role fit comes from Hindsight evidence on the Matching page.
  helpers.forEach(h => { h.roleScores = {}; });

  const households = [
    {id:'h101', name:'Sharma Residence', location:'Jubilee Hills', requirement:'cleaning', schedule:'Weekday mornings'},
    {id:'h102', name:'Reddy Residence', location:'Banjara Hills', requirement:'elder_care', schedule:'Live-in'},
    {id:'h104', name:'Iyer Residence', location:'Madhapur', requirement:'child_care', schedule:'Weekday, 9am–6pm'},
    {id:'h105', name:'Gupta Residence', location:'Kondapur', requirement:'child_care', schedule:'Weekday, 8am–5pm'},
    {id:'h106', name:'Nair Residence', location:'Gachibowli', requirement:'elder_care', schedule:'Live-in, new requirement'},
    {id:'h107', name:'Verma Residence', location:'Himayatnagar', requirement:'elder_care', schedule:'Full-time'},
  ];

  const placements = [
    {id:'p1', helperId:'anita', householdId:'h107', role:'elder_care', start:'2026-01-05', end:null, status:'active'},
    {id:'p2', helperId:'priya', householdId:'h102', role:'elder_care', start:'2025-11-10', end:null, status:'active'},
    {id:'p3', helperId:'priya', householdId:'h105', role:'child_care', start:'2025-08-01', end:'2025-09-14', status:'ended_poor_fit'},
    {id:'p4', helperId:'sunita', householdId:'h104', role:'child_care', start:'2025-09-01', end:'2025-10-20', status:'failed'},
    {id:'p5', helperId:'kavita', householdId:'h104', role:'child_care', start:'2025-11-01', end:'2025-12-15', status:'failed'},
    {id:'p6', helperId:'fatima', householdId:'h104', role:'child_care', start:'2026-01-10', end:'2026-02-18', status:'failed'},
    {id:'p7', helperId:'lakshmi', householdId:'h101', role:'cleaning', start:'2025-06-01', end:null, status:'active'},
    {id:'p8', helperId:'meena', householdId:'h106', role:'cooking', start:'2025-05-01', end:null, status:'active'},
    {id:'p9', helperId:'radha', householdId:'h105', role:'child_care', start:'2026-06-01', end:null, status:'active'},
  ];

  // Timeline events are derived from real records only: the placement roster here,
  // plus call outcomes and retained notes that syncBackendData() pulls from the server.
  const events = [];
  placements.forEach(p => {
    events.push({id:'ev_' + p.id + '_start', helperId:p.helperId, householdId:p.householdId, placementId:p.id,
      type:'placement_start', description:'Placement started (' + p.role.replace('_',' ') + ').', severity:null, date:p.start, source:'roster'});
    if(p.end){
      const replaced = p.status === 'failed';
      events.push({id:'ev_' + p.id + '_end', helperId:p.helperId, householdId:p.householdId, placementId:p.id,
        type:'placement_end', description: replaced ? 'Placement ended — household requested replacement.' : 'Placement ended — role mismatch.',
        severity:null, date:p.end, source:'roster'});
    }
  });

  return {
    helpers,
    households,
    placements,
    events,
    calls:[],
    reflections:[],      // filled by reflectOnHousehold() from Hindsight reflect
    recommendations:[],  // read by the dashboard; nothing writes canned ones any more
    activity:[],
    stagedBackups:[]     // read by the dashboard and household page; no fake backups are staged
  };
}

function uid(){
  return Math.random().toString(36).slice(2,9);
}

let INITIAL = seed();
let S = clone(INITIAL);
let MEM = {}; // entityId -> {world:[], experience:[], opinion:[], observation:[]}
let SCORES = {}; // entityId -> {trust, churn, difficulty}
let SCORE_HISTORY = {}; // entityId -> [{timestamp, trust, churn, difficulty}]
let route = {page:'dashboard', param:null};

function clone(o){
  return JSON.parse(JSON.stringify(o));
}

/** Wall-clock time of day (HH:MM:SS) for activity and memory entries. */
function nowStamp(){
  return new Date().toTimeString().slice(0,8);
}

/** Today as YYYY-MM-DD in local time. */
function todayIso(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function memOf(id){
  if(!MEM[id]) MEM[id] = {world:[], experience:[], opinion:[], observation:[]};
  return MEM[id];
}

/* ---------------------------------------------------------------------
   MULTI-ROLE NAVIGATION & PERMISSIONS
--------------------------------------------------------------------- */
const NAV_ADMIN = [
  {id:'dashboard', label:'Dashboard'},
  {id:'people', label:'People'},
  {id:'memory', label:'Hindsight Core'},
  {id:'matching', label:'Matching'},
  {id:'voice', label:'Voice Agent'},
  {id:'activity', label:'Agent Activity'},
];

const NAV_HELPER = [
  {id:'helperHome', label:'My work'},
];

const NAV_HOUSEHOLD = [
  {id:'householdHome', label:'My household'},
];

function getNavForCurrentUser(){
  if(!CURRENT_USER || !CURRENT_USER.isLoggedIn) return [];
  if(CURRENT_USER.role === 'helper') return NAV_HELPER;
  if(CURRENT_USER.role === 'household') return NAV_HOUSEHOLD;
  return NAV_ADMIN;
}

/** The only page a helper or household account can open. */
function homePageFor(){
  if(CURRENT_USER && CURRENT_USER.role === 'helper') return 'helperHome';
  if(CURRENT_USER && CURRENT_USER.role === 'household') return 'householdHome';
  return 'dashboard';
}

/* ---------------------------------------------------------------------
   SIGNED-IN USER
   Filled from the server session by authBoot() (js/auth.js). The coordinator
   default below is what the console uses when authentication is switched off
   (TRUSTMEMORY_AUTH=off) or the server cannot be reached.
   role: 'admin' (the coordinator) | 'helper' | 'household'
--------------------------------------------------------------------- */
let CURRENT_USER = {
  isLoggedIn: true,
  name: 'Agency Coordinator',
  email: '',
  role: 'admin',
  entityId: null,   // helper or household id for those roles
  authMode: 'off',  // 'on' when signed in with a real session
};
