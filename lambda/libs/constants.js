const TYPE_PATH = 'Path';
const TYPE_CLASS = 'Class'; 
const TYPE_FUNCTION = 'Function';
const EDGE_CONTAINS = 'contains';
const EDGE_CALL = 'calls';
const EDGE_EXTENDS = 'extends';


const PATH_META_DATA = 'path_metadata';
const CLASS_META_DATA = 'class_metadata';
const FUNC_META_DATA = 'function_metadata';

let BEDROCK_API_PAUSE_TIME = 2500;

function setBedrockAPIPauseTime(time) {
  BEDROCK_API_PAUSE_TIME = time;
}

module.exports = {
  TYPE_PATH,
  TYPE_CLASS,
  TYPE_FUNCTION,
  EDGE_CONTAINS,
  EDGE_CALL,
  EDGE_EXTENDS,
  PATH_META_DATA,
  CLASS_META_DATA,
  FUNC_META_DATA,
  BEDROCK_API_PAUSE_TIME,
  setBedrockAPIPauseTime
}
