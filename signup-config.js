// Email signup settings. Email submission stays disabled until all three are filled in.
// endpoint:     the Apps Script Web app URL ending in /exec (see Ritmo-Signup-Backend/部署说明.md).
//               Never paste the script editor URL or the results Sheet URL here.
// contactEmail: the team address shown in the privacy note, for removal requests.
// deleteBy:     the date you promise to delete stored emails, e.g. '31 March 2027'.
window.RITMO_SIGNUP = {
  endpoint: 'https://script.google.com/macros/s/AKfycbxSJX3sWLMKqyejmTvjHqaaN3TUBn8RJvqWuxx5HMZwGbqEc90cEQc45deOVCFkGOFfmQ/exec',
  contactEmail: 'ritmo-team@example.com', // placeholder: replace with the real team address before going public
  deleteBy: '31 March 2027'
};
